import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const pubDir = path.join(rootDir, 'public', 'images');

const ASSETS = [
  // --- Industries & Specializations ---
  {
    id: 'ai',
    dir: 'industries',
    url: 'https://images.unsplash.com/photo-1677442136019-21780efad99a?w=1200&auto=format&fit=crop&q=80',
    photographer: 'Steve Johnson',
    source: 'Unsplash',
  },
  {
    id: 'data-analysis',
    dir: 'industries',
    url: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1200&auto=format&fit=crop&q=80',
    photographer: 'Luke Chesser',
    source: 'Unsplash',
  },
  {
    id: 'data-science',
    dir: 'industries',
    url: 'https://images.unsplash.com/photo-1518186285589-2f7649de83e0?w=1200&auto=format&fit=crop&q=80',
    photographer: 'Markus Spiske',
    source: 'Unsplash',
  },
  {
    id: 'software-engineering',
    dir: 'industries',
    url: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=1200&auto=format&fit=crop&q=80',
    photographer: 'Christopher Gower',
    source: 'Unsplash',
  },
  {
    id: 'frontend',
    dir: 'industries',
    url: 'https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?w=1200&auto=format&fit=crop&q=80',
    photographer: 'Igor Miske',
    source: 'Unsplash',
  },
  {
    id: 'backend',
    dir: 'industries',
    url: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=1200&auto=format&fit=crop&q=80',
    photographer: 'Taylor Vick',
    source: 'Unsplash',
  },
  {
    id: 'cybersecurity',
    dir: 'industries',
    url: 'https://images.unsplash.com/photo-1563986768609-322da13575f3?w=1200&auto=format&fit=crop&q=80',
    photographer: 'FLY:D',
    source: 'Unsplash',
  },
  {
    id: 'cloud',
    dir: 'industries',
    url: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1200&auto=format&fit=crop&q=80',
    photographer: 'NASA',
    source: 'Unsplash',
  },
  {
    id: 'it-support',
    dir: 'industries',
    url: 'https://images.unsplash.com/photo-1588508065123-287b28e013da?w=1200&auto=format&fit=crop&q=80',
    photographer: 'Compare Fibre',
    source: 'Unsplash',
  },
  {
    id: 'human-resources',
    dir: 'industries',
    url: 'https://images.unsplash.com/photo-1521737711867-e3b97375f902?w=1200&auto=format&fit=crop&q=80',
    photographer: 'Unseen Studio',
    source: 'Unsplash',
  },
  {
    id: 'business-admin',
    dir: 'industries',
    url: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1200&auto=format&fit=crop&q=80',
    photographer: 'Sean Pollock',
    source: 'Unsplash',
  },
  {
    id: 'digital-marketing',
    dir: 'industries',
    url: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&auto=format&fit=crop&q=80',
    photographer: 'Carlos Muza',
    source: 'Unsplash',
  },
  {
    id: 'ui-ux',
    dir: 'industries',
    url: 'https://images.unsplash.com/photo-1581291518857-4e27b48ff24e?w=1200&auto=format&fit=crop&q=80',
    photographer: 'Balázs Kétyi',
    source: 'Unsplash',
  },
  {
    id: 'finance',
    dir: 'industries',
    url: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=1200&auto=format&fit=crop&q=80',
    photographer: 'Towfiqu barbhuiya',
    source: 'Unsplash',
  },
  {
    id: 'project-management',
    dir: 'industries',
    url: 'https://images.unsplash.com/photo-1531403009284-440f080d1e12?w=1200&auto=format&fit=crop&q=80',
    photographer: 'Alvaro Reyes',
    source: 'Unsplash',
  },
  {
    id: 'sales',
    dir: 'industries',
    url: 'https://images.unsplash.com/photo-1556742049-0a67e5572263?w=1200&auto=format&fit=crop&q=80',
    photographer: 'Adeolu Eletu',
    source: 'Unsplash',
  },
  {
    id: 'healthcare',
    dir: 'industries',
    url: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=1200&auto=format&fit=crop&q=80',
    photographer: 'National Cancer Institute',
    source: 'Unsplash',
  },
  {
    id: 'engineering',
    dir: 'industries',
    url: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=1200&auto=format&fit=crop&q=80',
    photographer: 'ThisisEngineering RAEng',
    source: 'Unsplash',
  },
  {
    id: 'entrepreneurship',
    dir: 'industries',
    url: 'https://images.unsplash.com/photo-1559136555-9303baea8ebd?w=1200&auto=format&fit=crop&q=80',
    photographer: 'Austin Distel',
    source: 'Unsplash',
  },
  {
    id: 'education',
    dir: 'industries',
    url: 'https://images.unsplash.com/photo-1524178232363-1fb2b075b655?w=1200&auto=format&fit=crop&q=80',
    photographer: 'Ksenia Chernaya',
    source: 'Unsplash',
  },
  {
    id: 'legal',
    dir: 'industries',
    url: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=1200&auto=format&fit=crop&q=80',
    photographer: 'Tingey Injury Law Firm',
    source: 'Unsplash',
  },
  {
    id: 'operations',
    dir: 'industries',
    url: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=1200&auto=format&fit=crop&q=80',
    photographer: 'Petre Barlea',
    source: 'Unsplash',
  },

  // --- Personas ---
  {
    id: 'students',
    dir: 'personas',
    url: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=1200&auto=format&fit=crop&q=80',
    photographer: 'Priscilla Du Preez',
    source: 'Unsplash',
  },
  {
    id: 'professionals',
    dir: 'personas',
    url: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=1200&auto=format&fit=crop&q=80',
    photographer: 'Christina @ wocintechchat',
    source: 'Unsplash',
  },
  {
    id: 'switchers',
    dir: 'personas',
    url: 'https://images.unsplash.com/photo-1531482615713-2afd69097998?w=1200&auto=format&fit=crop&q=80',
    photographer: 'Christina @ wocintechchat',
    source: 'Unsplash',
  },

  // --- Features & Modals ---
  {
    id: 'cv-studio',
    dir: 'features',
    url: 'https://images.unsplash.com/photo-1586281380349-632531db7ed4?w=1200&auto=format&fit=crop&q=80',
    photographer: 'Glenn Carstens-Peters',
    source: 'Unsplash',
  },
  {
    id: 'interview-prep',
    dir: 'features',
    url: 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=1200&auto=format&fit=crop&q=80',
    photographer: 'Christina @ wocintechchat',
    source: 'Unsplash',
  },
  {
    id: 'ai-mentor',
    dir: 'features',
    url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200&auto=format&fit=crop&q=80',
    photographer: 'Milad Fakurian',
    source: 'Unsplash',
  },
  {
    id: 'skill-assessment',
    dir: 'features',
    url: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=1200&auto=format&fit=crop&q=80',
    photographer: 'Green Chameleon',
    source: 'Unsplash',
  },
  {
    id: 'career-roadmap',
    dir: 'features',
    url: 'https://images.unsplash.com/photo-1506784983877-45594efa4cbe?w=1200&auto=format&fit=crop&q=80',
    photographer: 'Eric Rothermel',
    source: 'Unsplash',
  },
];

async function processAll() {
  console.log(`Starting download and WebP optimization of ${ASSETS.length} assets...`);

  for (const asset of ASSETS) {
    const targetDir = path.join(pubDir, asset.dir);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const outFile800 = path.join(targetDir, `${asset.id}.webp`);
    const outFile400 = path.join(targetDir, `${asset.id}-sm.webp`);

    if (fs.existsSync(outFile800) && fs.existsSync(outFile400)) {
      console.log(`✓ [cached] ${asset.dir}/${asset.id}.webp`);
      continue;
    }

    try {
      console.log(`Downloading ${asset.id} from ${asset.photographer}...`);
      const res = await fetch(asset.url);
      if (!res.ok) {
        console.error(`Failed to fetch ${asset.id}: HTTP ${res.status}`);
        continue;
      }
      const buffer = Buffer.from(await res.arrayBuffer());

      // 800x500 (16:10 / 8:5) master WebP
      await sharp(buffer)
        .resize(800, 500, { fit: 'cover', position: 'center' })
        .webp({ quality: 80, effort: 5 })
        .toFile(outFile800);

      // 400x250 thumbnail WebP
      await sharp(buffer)
        .resize(400, 250, { fit: 'cover', position: 'center' })
        .webp({ quality: 78, effort: 5 })
        .toFile(outFile400);

      const size800 = fs.statSync(outFile800).size;
      const size400 = fs.statSync(outFile400).size;
      console.log(`✓ Saved ${asset.dir}/${asset.id}.webp (${(size800 / 1024).toFixed(1)} KB) and -sm.webp (${(size400 / 1024).toFixed(1)} KB)`);
    } catch (err) {
      console.error(`Error processing ${asset.id}:`, err.message);
    }
  }

  console.log('All platform images processed successfully!');
}

processAll().catch(console.error);

