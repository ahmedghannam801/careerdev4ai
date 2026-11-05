---
name: image-assets-and-licensing
description: Governs real photography sourcing, stock photo licensing verification, asset optimization (WebP/AVIF), responsive delivery, and legal compliance for CareerDev4AI.
---

# Image Assets & Licensing Skill

This skill governs the sourcing, licensing verification, performance optimization, and responsive delivery of all photographic and graphic assets in CareerDev4AI.

## When to Use

Activate this skill when:
- Adding or replacing photographic imagery in landing pages, heroes, or feature cards.
- Verifying commercial usage rights, photographer attribution, and license terms.
- Optimizing images for Core Web Vitals (Largest Contentful Paint - LCP).
- Converting assets to modern WebP / AVIF formats using `sharp`.
- Generating responsive `srcset` and `<picture>` implementations.
- Auditing assets to ensure no AI-hallucinated human faces or fake endorsements exist.

## Asset Licensing & Ethical Sourcing Rules

1. **Permitted Sources**:
   - **Unsplash**: Free commercial and non-commercial use under the Unsplash License (no permission needed, attribution appreciated).
   - **Pexels**: Free commercial use under the Pexels License.
   - **Original/Authorized Assets**: First-party vector graphics or licensed photography.

2. **Strict Prohibitions**:
   - **NEVER use AI-generated human images**: AI faces often feature uncanny artifacts, abnormal fingers/hair, and convey an inauthentic, untrustworthy impression for a career platform.
   - **NEVER use watermarked images**: Stock images with watermarks or unauthorized previews are strictly forbidden.
   - **NEVER imply false endorsement**: Stock photo subjects must never be represented as real specific CareerDev4AI employees, users, or verified testimonials unless explicitly contracted.
   - **NEVER use unstable random URLs**: Avoid direct hotlinking to volatile external URLs (`https://source.unsplash.com/random...`). Always persist optimized local assets or stable immutable CDN endpoints.

3. **Required Asset Documentation**:
   Every photographic asset added to the project must be documented with:
   - Photographer / Creator name.
   - Original source URL.
   - License type (e.g. Unsplash License).
   - Description of the subject matter.

## Image Optimization Workflow with Sharp

1. **Download & Ingest**:
   Fetch the high-resolution source asset into a temporary buffer.
2. **Resize & Aspect Ratio Crop**:
   Crop intentionally using `sharp` with optimal focal point (e.g. `fit: 'cover', position: 'top'` or `'entropy'`).
3. **Format Conversion**:
   - Primary: WebP with quality 85–88 (`effort: 6`).
   - Fallback: MozJPEG / Progressive JPEG with quality 85.
4. **Responsive Resolution Generation**:
   Generate multiple resolutions for responsive viewports:
   - `1200w` for desktop high-DPI displays.
   - `800w` for tablets and mobile displays.
5. **Implement `<picture>` Tag in JSX**:
   ```tsx
   <picture>
     <source
       srcSet="/images/hero-professional-1200.webp 1200w, /images/hero-professional-800.webp 800w"
       sizes="(min-width: 1024px) 560px, (min-width: 640px) 600px, 92vw"
       type="image/webp"
     />
     <img
       src="/images/hero-professional.jpg"
       alt="Professional reviewing career roadmap on laptop"
       width={1200}
       height={900}
       fetchPriority="high"
       loading="eager"
       className="w-full h-auto aspect-[4/3] object-cover rounded-2xl border border-[var(--color-border)] shadow-xl"
     />
   </picture>
   ```

## Quality Checklist

- [ ] Is the image authentic, verified real photography (not AI-generated)?
- [ ] Is the license verified and permissible for commercial use?
- [ ] Is the asset optimized locally as WebP (under 120 KB)?
- [ ] Does the `<img>` tag define explicit `width` and `height` attributes to prevent CLS?
- [ ] If the image is above-the-fold (Hero), is it set to `loading="eager"` and `fetchPriority="high"`?
- [ ] If below-the-fold, is it set to `loading="lazy"` and `decoding="async"`?
- [ ] Is meaningful, accessible `alt` text provided?

## Common Failure Patterns to Avoid

- **Hotlinking Dynamic CDNs**: Relying on external URLs that fail or change under rate limits.
- **Megabyte Bloat**: Embedding 4MB raw uncompressed PNGs/JPEGs directly into the bundle.
- **Missing Aspect Ratios**: Omitting width/height attributes leading to severe Cumulative Layout Shift (CLS).
