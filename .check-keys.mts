import { AR_STRINGS } from './src/translations/sourceStrings.ts';
for (const k of [
  'Roles',
  'Target Roles',
  'The product',
  'Product',
  'How It Works',
  'Preview',
  'Features',
  'AI Guidance',
  'Personas',
  'FAQ',
]) {
  console.log(k, '=>', AR_STRINGS[k] ?? '(MISSING)');
}
