/**
 * The CV template API.
 *
 * The client never decides whether a template is allowed. It may draw a lock,
 * but the apply and export routes ask this module, which asks the verified
 * subscription. The same rule is used for the catalogue the client reads, so
 * the interface and the server cannot disagree about a candidate's access.
 */

import type { Express, Response } from 'express';
import type { AuthedRequest } from '../auth/require-auth.ts';
import { requireAuth } from '../auth/require-auth.ts';
import { requireAdmin, requirePermission, type AdminRequest } from '../admin/permissions.ts';
import { getCv, listCvs } from '../db/cvs.ts';
import { getCvVersion, listCvVersions } from '../db/cvVersions.ts';
import { upsertPreferences } from '../db/preferences.ts';
import { logAdminAction } from '../db/admin.ts';
import type { CVProfile } from '../../src/types/career.ts';
import { isResumeLanguage } from '../../shared/resumeLanguage.ts';
import {
  CV_TEMPLATE_CATEGORIES,
  buildCvTemplateCatalog,
  isBuiltinCvTemplateId,
  isCvTemplateCategory,
  isCvTemplateIdShape,
  validateCvTemplateMetadata,
} from '../../shared/cvTemplates.ts';
import {
  createCvTemplateRow,
  deleteCvTemplateRow,
  getCvTemplateCatalog,
  getCvTemplateForUser,
  listCvTemplateAdminRows,
  listCvTemplateRows,
  updateCvTemplateRow,
} from './service.ts';
import { buildCvDocx } from './docx.ts';

function str(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function optionalStr(value: unknown, max: number): string | null {
  if (value === undefined || value === null || value === '') return null;
  return str(value, max) || null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** A conservative check that a body is a CV document, not an arbitrary blob. */
function isCvProfile(value: unknown): value is CVProfile {
  if (!isRecord(value)) return false;
  const arrayFields = [
    'experiences',
    'education',
    'projects',
    'skillsList',
    'certifications',
    'links',
    'volunteering',
    'courses',
    'internships',
    'languages',
    'awards',
    'publications',
    'research',
    'leadership',
  ];
  for (const field of arrayFields) {
    if (value[field] !== undefined && !Array.isArray(value[field])) return false;
  }
  return true;
}

function safeFileName(name: string): string {
  const base = name.replace(/[^\p{L}\p{N}\-_ ]/gu, '').trim().slice(0, 60);
  return base || 'CV';
}

export function registerCvTemplateRoutes(app: Express): void {
  /* ------------------------------------------------------------------------ */
  /* Candidate catalogue                                                      */
  /* ------------------------------------------------------------------------ */

  app.get('/api/cv-templates', requireAuth, async (req: AuthedRequest, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const catalog = await getCvTemplateCatalog(req.authUser!.id);
      return res.json({
        success: true,
        categories: CV_TEMPLATE_CATEGORIES,
        templates: catalog.templates,
        currentTemplateId: catalog.currentTemplateId,
        enforcementEnabled: catalog.enforcementEnabled,
      });
    } catch (error) {
      console.error('Failed to load the CV template catalogue:', error);
      return res.status(500).json({ error: 'Failed to load the CV template catalogue' });
    }
  });

  app.post('/api/cv-templates/apply', requireAuth, async (req: AuthedRequest, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const templateId = str(req.body?.templateId, 64);
    if (!isCvTemplateIdShape(templateId)) {
      return res.status(400).json({ error: 'Invalid CV template' });
    }

    try {
      const result = await getCvTemplateForUser(req.authUser!.id, templateId);
      if (!result) {
        return res.status(404).json({ error: 'This template is not available.' });
      }
      if (!result.access.allowed) {
        return res.status(403).json({
          error: result.access.reason,
          code: 'UPGRADE_REQUIRED',
          templateId,
          access: result.access,
        });
      }

      const saved = await upsertPreferences(req.authUser!.id, { cv_template_id: templateId });
      return res.json({
        success: true,
        templateId,
        access: result.access,
        preferences: {
          cvTemplateId: saved.cv_template_id ?? templateId,
        },
      });
    } catch (error) {
      console.error('Failed to apply the CV template:', error);
      return res.status(500).json({ error: 'Failed to apply the CV template' });
    }
  });

  /**
   * Authorises a PDF export.
   *
   * The PDF itself is produced by the browser printing the real rendered
   * template, because that is what preserves Arabic shaping and the exact
   * layout. The browser cannot be trusted to decide whether the export is
   * allowed, so it asks first and prints only after this route says yes.
   */
  app.get(
    '/api/cv-templates/:id/export/authorize',
    requireAuth,
    async (req: AuthedRequest, res: Response) => {
      res.setHeader('Cache-Control', 'no-store');
      const templateId = str(req.params.id, 64);
      if (!isCvTemplateIdShape(templateId)) {
        return res.status(400).json({ error: 'Invalid CV template' });
      }
      try {
        const result = await getCvTemplateForUser(req.authUser!.id, templateId);
        if (!result) {
          return res.status(404).json({ error: 'This template is not available.' });
        }
        if (!result.access.allowed) {
          return res.status(403).json({
            error: result.access.reason,
            code: 'UPGRADE_REQUIRED',
            access: result.access,
          });
        }
        return res.json({
          success: true,
          allowed: true,
          templateId,
          access: result.access,
        });
      } catch (error) {
        console.error('Failed to authorise the CV export:', error);
        return res.status(500).json({ error: 'Failed to authorise the CV export' });
      }
    }
  );

  /* ------------------------------------------------------------------------ */
  /* DOCX export                                                              */
  /* ------------------------------------------------------------------------ */

  app.post(
    '/api/cv-templates/:id/export/docx',
    requireAuth,
    async (req: AuthedRequest, res: Response) => {
      res.setHeader('Cache-Control', 'no-store');
      const templateId = str(req.params.id, 64);
      if (!isCvTemplateIdShape(templateId)) {
        return res.status(400).json({ error: 'Invalid CV template' });
      }

      try {
        const result = await getCvTemplateForUser(req.authUser!.id, templateId);
        if (!result) {
          return res.status(404).json({ error: 'This template is not available.' });
        }
        if (!result.access.allowed) {
          return res.status(403).json({
            error: result.access.reason,
            code: 'UPGRADE_REQUIRED',
            access: result.access,
          });
        }

        // A stored CV can only be exported by its owner. The ownership check
        // happens before the document is read, so another candidate's id is
        // answered exactly like a missing one.
        let cv: CVProfile | null = null;
        const versionId = str(req.body?.versionId, 64);
        const cvId = str(req.body?.cvId, 64);

        if (versionId) {
          const version = await getCvVersion(req.authUser!.id, versionId);
          if (!version || !isCvProfile(version.profileJson)) {
            return res.status(404).json({ error: 'CV version not found' });
          }
          cv = version.profileJson;
        } else if (cvId) {
          const owned = await getCv(req.authUser!.id, cvId);
          if (!owned) return res.status(404).json({ error: 'CV not found' });
          const versions = (await listCvVersions(req.authUser!.id)).filter(
            (version) => version.cvId === cvId
          );
          const latest = versions[0];
          if (!latest || !isCvProfile(latest.profileJson)) {
            return res.status(404).json({ error: 'This CV has no saved document to export.' });
          }
          cv = latest.profileJson;
        } else if (isCvProfile(req.body?.cv)) {
          cv = req.body.cv;
        }

        if (!cv) {
          return res.status(400).json({ error: 'No CV document was provided.' });
        }

        const language = isResumeLanguage(req.body?.language) ? req.body.language : 'en';
        const buffer = await buildCvDocx({ cv, language, template: result.template });
        const filename = `${safeFileName(cv.fullName)}-${result.template.id}.docx`;

        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        );
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(buffer);
      } catch (error) {
        console.error('Failed to export the CV as DOCX:', error);
        return res.status(500).json({ error: 'Failed to export the CV as DOCX' });
      }
    }
  );

  /* ------------------------------------------------------------------------ */
  /* Administration                                                           */
  /* ------------------------------------------------------------------------ */

  app.get(
    '/api/admin/cv-templates',
    requireAuth,
    requireAdmin,
    requirePermission('plans.manage'),
    async (_req: AdminRequest, res: Response) => {
      res.setHeader('Cache-Control', 'no-store');
      try {
        const { rows, available } = await listCvTemplateRows();
        const catalog = buildCvTemplateCatalog(rows, { includeDisabled: true });
        return res.json({
          success: true,
          templates: catalog,
          rows,
          categories: CV_TEMPLATE_CATEGORIES,
          adminTableAvailable: available,
        });
      } catch (error) {
        console.error('Failed to load the admin CV template catalogue:', error);
        return res.status(500).json({ error: 'Failed to load the CV template catalogue' });
      }
    }
  );

  app.post(
    '/api/admin/cv-templates',
    requireAuth,
    requireAdmin,
    requirePermission('plans.manage'),
    async (req: AdminRequest, res: Response) => {
      const input = {
        templateId: str(req.body?.templateId, 48),
        nameEn: optionalStr(req.body?.nameEn, 80),
        nameAr: optionalStr(req.body?.nameAr, 80),
        category: optionalStr(req.body?.category, 32),
        tier: req.body?.tier === 'free' || req.body?.tier === 'premium' ? req.body.tier : null,
        enabled: req.body?.enabled !== false,
        featured: req.body?.featured === true,
        sortOrder: typeof req.body?.sortOrder === 'number' ? req.body.sortOrder : null,
        thumbnailUrl: optionalStr(req.body?.thumbnailUrl, 2048),
        descriptionEn: optionalStr(req.body?.descriptionEn, 400),
        descriptionAr: optionalStr(req.body?.descriptionAr, 400),
        baseTemplateId: optionalStr(req.body?.baseTemplateId, 64),
      };

      const errors = validateCvTemplateMetadata(input, { requireId: true });
      if (!input.baseTemplateId) {
        errors.push('A base template is required so the new template has a structure.');
      }
      if (input.templateId && isBuiltinCvTemplateId(input.templateId)) {
        errors.push('That id belongs to a built-in template.');
      }
      if (errors.length > 0) {
        return res.status(400).json({ error: errors[0], errors });
      }

      try {
        const created = await createCvTemplateRow({
          ...input,
          templateId: input.templateId,
          baseTemplateId: input.baseTemplateId,
        });
        await logAdminAction(req.admin!, {
          action: 'cv_template.created',
          entityType: 'cv_template',
          entityId: created.template_id,
          metadata: { name: created.name_en, base: created.base_template_id },
        });
        return res.status(201).json({ success: true, template: created });
      } catch (error) {
        console.error('Failed to create the CV template:', error);
        const message = String((error as { message?: string }).message ?? '');
        if (/duplicate|unique/i.test(message)) {
          return res.status(409).json({ error: 'A template with that id already exists.' });
        }
        if (/relation .* does not exist|could not find the table/i.test(message)) {
          return res.status(503).json({
            error: 'The cv_templates table has not been migrated on this deployment yet.',
          });
        }
        return res.status(500).json({ error: 'Failed to create the CV template' });
      }
    }
  );

  app.patch(
    '/api/admin/cv-templates/:id',
    requireAuth,
    requireAdmin,
    requirePermission('plans.manage'),
    async (req: AdminRequest, res: Response) => {
      const templateId = str(req.params.id, 64);
      if (!isCvTemplateIdShape(templateId)) {
        return res.status(400).json({ error: 'Invalid CV template' });
      }

      const updates = {
        nameEn:
          req.body?.nameEn !== undefined ? optionalStr(req.body.nameEn, 80) : undefined,
        nameAr:
          req.body?.nameAr !== undefined ? optionalStr(req.body.nameAr, 80) : undefined,
        category:
          req.body?.category !== undefined ? optionalStr(req.body.category, 32) : undefined,
        tier:
          req.body?.tier === 'free' || req.body?.tier === 'premium'
            ? (req.body.tier as 'free' | 'premium')
            : undefined,
        enabled:
          req.body?.enabled === undefined ? undefined : req.body.enabled !== false,
        featured:
          req.body?.featured === undefined ? undefined : req.body.featured === true,
        sortOrder:
          req.body?.sortOrder === undefined
            ? undefined
            : typeof req.body.sortOrder === 'number'
              ? req.body.sortOrder
              : null,
        thumbnailUrl:
          req.body?.thumbnailUrl !== undefined
            ? optionalStr(req.body.thumbnailUrl, 2048)
            : undefined,
        descriptionEn:
          req.body?.descriptionEn !== undefined
            ? optionalStr(req.body.descriptionEn, 400)
            : undefined,
        descriptionAr:
          req.body?.descriptionAr !== undefined
            ? optionalStr(req.body.descriptionAr, 400)
            : undefined,
      };

      const errors = validateCvTemplateMetadata(
        { ...updates, templateId },
        { requireId: false }
      );
      if (updates.category && !isCvTemplateCategory(updates.category)) {
        if (!errors.includes('The category is not one the library knows.')) {
          errors.push('The category is not one the library knows.');
        }
      }
      if (errors.length > 0) {
        return res.status(400).json({ error: errors[0], errors });
      }

      try {
        const rows = await listCvTemplateAdminRows();
        const existing = rows.find((row) => row.template_id === templateId) ?? null;
        const isBuiltin = isBuiltinCvTemplateId(templateId);
        if (!isBuiltin && !existing) {
          return res.status(404).json({ error: 'Template not found' });
        }

        const saved = await updateCvTemplateRow(
          templateId,
          {
            ...updates,
            baseTemplateId: existing?.base_template_id ?? null,
          },
          existing
        );
        await logAdminAction(req.admin!, {
          action: 'cv_template.updated',
          entityType: 'cv_template',
          entityId: templateId,
          metadata: { enabled: saved.enabled, tier: saved.tier },
        });
        return res.json({ success: true, template: saved });
      } catch (error) {
        console.error('Failed to update the CV template:', error);
        return res.status(500).json({ error: 'Failed to update the CV template' });
      }
    }
  );

  app.delete(
    '/api/admin/cv-templates/:id',
    requireAuth,
    requireAdmin,
    requirePermission('plans.manage'),
    async (req: AdminRequest, res: Response) => {
      const templateId = str(req.params.id, 64);
      if (!isCvTemplateIdShape(templateId)) {
        return res.status(400).json({ error: 'Invalid CV template' });
      }
      try {
        const rows = await listCvTemplateAdminRows();
        const existing = rows.find((row) => row.template_id === templateId) ?? null;

        if (isBuiltinCvTemplateId(templateId)) {
          // A built-in structure ships with the renderer. It is disabled, not
          // deleted, so a stale preference still resolves to a real template.
          const saved = await updateCvTemplateRow(
            templateId,
            { enabled: false },
            existing
          );
          await logAdminAction(req.admin!, {
            action: 'cv_template.disabled',
            entityType: 'cv_template',
            entityId: templateId,
            metadata: {},
          });
          return res.json({ success: true, disabled: true, template: saved });
        }

        if (!existing) {
          return res.status(404).json({ error: 'Template not found' });
        }
        await deleteCvTemplateRow(templateId);
        await logAdminAction(req.admin!, {
          action: 'cv_template.deleted',
          entityType: 'cv_template',
          entityId: templateId,
          metadata: {},
        });
        return res.json({ success: true, deleted: true });
      } catch (error) {
        console.error('Failed to remove the CV template:', error);
        return res.status(500).json({ error: 'Failed to remove the CV template' });
      }
    }
  );

  /* ------------------------------------------------------------------------ */
  /* A small read-only list of the candidate's saved CVs, for the export picker */
  /* ------------------------------------------------------------------------ */

  app.get('/api/cv-templates/sources', requireAuth, async (req: AuthedRequest, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const [cvs, versions] = await Promise.all([
        listCvs(req.authUser!.id),
        listCvVersions(req.authUser!.id),
      ]);
      return res.json({
        success: true,
        cvs: cvs.map((cv) => ({
          id: cv.id,
          name: cv.name,
          targetRoleTitle: cv.targetRoleTitle,
          updatedAt: cv.updatedAt,
          versionCount: versions.filter((version) => version.cvId === cv.id).length,
        })),
      });
    } catch (error) {
      console.error('Failed to load CV sources:', error);
      return res.status(500).json({ error: 'Failed to load CV sources' });
    }
  });
}
