/**
 * Writes a genuine legacy Word document.
 *
 * A `.doc` file is not a text file and not a zip: it is a Compound File
 * Binary container holding a Word document written in the Word 97-2003
 * binary format. To test the reader honestly, the fixture has to be one.
 *
 * This writer produces a real one:
 *
 *   - a proper compound file with a 512-byte sector size, a sector
 *     allocation table, a directory and a mini allocation table;
 *   - both streams stored in the mini stream, which is where a file this
 *     small really puts them, so the reader's small-stream path is the one
 *     under test;
 *   - a Word information block with the piece table at the offset the
 *     format puts it;
 *   - two pieces of text — one 16-bit, one 8-bit — so that both halves of
 *     the piece table are exercised.
 *
 * The result is a file the reader has no reason to accept specially: it
 * passes or fails on the bytes.
 */

const ENDOFCHAIN = 0xfffffffe;
const FREESECT = 0xffffffff;
const FATSECT = 0xfffffffd;

const SECTOR_SIZE = 512;
const MINI_SECTOR_SIZE = 64;
const MINI_CUTOFF = 4096;

/** Builds the Word information block the reader looks into. */
function buildFib(clxOffset, clxLength) {
  const fib = Buffer.alloc(1024);

  // The signature every Word document starts with.
  fib.writeUInt16LE(0xa5ec, 0x00);
  // nFib 193: Word 97.
  fib.writeUInt16LE(193, 0x02);
  // The flags: bit 9 says the piece table lives in "1Table".
  fib.writeUInt16LE(0x0200, 0x0a);
  // The number of offset/length pairs in the block. The piece table is the
  // thirty-fourth of them.
  fib.writeUInt16LE(93, 0x98);
  // The offset and the length of the piece table.
  fib.writeUInt32LE(clxOffset, 0x01a2);
  fib.writeUInt32LE(clxLength, 0x01a6);

  return fib;
}

/**
 * Builds the piece table for two pieces of text.
 *
 * The first piece is 16-bit Unicode and the second is 8-bit, so the reader
 * has to handle both encodings and the boundary between them.
 */
function buildClx(textOffset, firstLength, secondLength) {
  const pieceCount = 2;
  const plcLength = (pieceCount + 1) * 4 + pieceCount * 8;

  const plc = Buffer.alloc(plcLength);
  // The character positions: the start of each piece and the end of the last.
  plc.writeUInt32LE(0, 0);
  plc.writeUInt32LE(firstLength, 4);
  plc.writeUInt32LE(firstLength + secondLength, 8);

  const pieceBase = (pieceCount + 1) * 4;

  // The first piece: 16-bit, so its offset is the offset itself.
  plc.writeUInt16LE(0, pieceBase);
  plc.writeUInt32LE(textOffset, pieceBase + 2);
  plc.writeUInt16LE(0, pieceBase + 6);

  // The second piece: 8-bit, so its offset is doubled and the compressed
  // bit is set.
  const compressedOffset = (textOffset + firstLength * 2) * 2;
  plc.writeUInt16LE(0, pieceBase + 8);
  plc.writeUInt32LE(compressedOffset | 0x40000000, pieceBase + 10);
  plc.writeUInt16LE(0, pieceBase + 14);

  // The header of the piece table: the kind, then the length, then the
  // table itself.
  const clx = Buffer.alloc(5 + plc.length);
  clx.writeUInt8(0x02, 0);
  clx.writeUInt32LE(plc.length, 1);
  plc.copy(clx, 5);

  return clx;
}

/** A directory entry. */
function buildDirectoryEntry({ name, type, color, left, right, child, start, size }) {
  const entry = Buffer.alloc(128, 0);
  const encoded = Buffer.from(name, 'utf16le');
  encoded.copy(entry, 0);
  // The length of the name in bytes, including the null terminator.
  entry.writeUInt16LE(encoded.length + 2, 0x40);
  entry.writeUInt8(type, 0x42);
  entry.writeUInt8(color, 0x43);
  entry.writeUInt32LE(left, 0x44);
  entry.writeUInt32LE(right, 0x48);
  entry.writeUInt32LE(child, 0x4c);
  entry.writeUInt32LE(start, 0x74);
  entry.writeUInt32LE(size, 0x78);
  return entry;
}

/**
 * Encodes text as Windows-1252.
 *
 * Node's "latin1" encoding is a straight truncation of the code point, so
 * an em dash becomes the control character 0x14 rather than the byte 0x97
 * a real document holds. The typographic characters are mapped by hand so
 * that the 8-bit piece of the fixture is a real one.
 */
const WINDOWS_1252_SPECIALS = {
  '€': 0x80,
  '‚': 0x82,
  'ƒ': 0x83,
  '„': 0x84,
  '…': 0x85,
  '†': 0x86,
  '‡': 0x87,
  'ˆ': 0x88,
  '‰': 0x89,
  'Š': 0x8a,
  '‹': 0x8b,
  'Œ': 0x8c,
  'Ž': 0x8e,
  '‘': 0x91,
  '’': 0x92,
  '“': 0x93,
  '”': 0x94,
  '•': 0x95,
  '–': 0x96,
  '—': 0x97,
  '˜': 0x98,
  '™': 0x99,
  'š': 0x9a,
  '›': 0x9b,
  'œ': 0x9c,
  'ž': 0x9e,
  'Ÿ': 0x9f,
};

function toWindows1252(text) {
  const bytes = [];
  for (const character of text) {
    const code = character.codePointAt(0);
    if (code <= 0xff) {
      bytes.push(code);
      continue;
    }
    const special = WINDOWS_1252_SPECIALS[character];
    // A character the code page cannot hold becomes a question mark, which
    // is what a writer without the glyph would have written.
    bytes.push(special === undefined ? 0x3f : special);
  }
  return Buffer.from(bytes);
}

/**
 * Writes a legacy Word document.
 *
 * `paragraphs` are the lines of the document. The text is written as two
 * pieces: the first half as 16-bit Unicode and the second as 8-bit, which
 * is how a document written on a machine with a local code page reads.
 */
export function writeLegacyDoc(paragraphs) {
  const lines = paragraphs.map((line) => `${line}\r`).join('');

  // The first piece is the first half of the text, the second is the rest.
  const half = Math.floor(lines.length / 2);
  const firstPart = lines.slice(0, half);
  const secondPart = lines.slice(half);

  const firstBytes = Buffer.from(firstPart, 'utf16le');
  const secondBytes = toWindows1252(secondPart);

  const clx = buildClx(1024, firstPart.length, secondPart.length);

  const wordStream = Buffer.concat([buildFib(512, clx.length), firstBytes, secondBytes]);
  // The table stream holds more than the piece table — the style sheet and
  // the lists come first — so the piece table does not start at the
  // beginning of it.
  const tableStream = Buffer.concat([Buffer.alloc(512, 0), clx]);

  // Both streams are small, so both live in the mini stream.
  const wordMiniSectors = Math.ceil(wordStream.length / MINI_SECTOR_SIZE);
  const tableMiniSectors = Math.ceil(tableStream.length / MINI_SECTOR_SIZE);
  const miniSectorCount = wordMiniSectors + tableMiniSectors;

  const miniStream = Buffer.alloc(miniSectorCount * MINI_SECTOR_SIZE, 0);
  wordStream.copy(miniStream, 0);
  tableStream.copy(miniStream, wordMiniSectors * MINI_SECTOR_SIZE);

  // The mini allocation table: each stream is one chain, and the two
  // chains follow each other in the mini stream.
  const miniFat = new Uint32Array(128).fill(FREESECT);
  for (let index = 0; index < wordMiniSectors; index += 1) {
    miniFat[index] = index === wordMiniSectors - 1 ? ENDOFCHAIN : index + 1;
  }
  for (let index = 0; index < tableMiniSectors; index += 1) {
    const sector = wordMiniSectors + index;
    miniFat[sector] = index === tableMiniSectors - 1 ? ENDOFCHAIN : sector + 1;
  }

  // The sector layout:
  //   0  the sector allocation table
  //   1  the directory
  //   2  the mini allocation table
  //   3+ the mini stream
  const miniStreamSectors = Math.ceil(miniStream.length / SECTOR_SIZE);
  const totalSectors = 3 + miniStreamSectors;

  const fat = new Uint32Array(SECTOR_SIZE / 4).fill(FREESECT);
  fat[0] = FATSECT;
  fat[1] = ENDOFCHAIN;
  fat[2] = ENDOFCHAIN;
  for (let index = 0; index < miniStreamSectors; index += 1) {
    fat[3 + index] = index === miniStreamSectors - 1 ? ENDOFCHAIN : 4 + index;
  }

  // The directory: the root, the two streams and one unused entry.
  const directory = Buffer.concat([
    buildDirectoryEntry({
      name: 'Root Entry',
      type: 5,
      color: 1,
      left: 0xffffffff,
      right: 0xffffffff,
      child: 1,
      start: 3,
      size: miniStream.length,
    }),
    buildDirectoryEntry({
      name: 'WordDocument',
      type: 2,
      color: 1,
      left: 0xffffffff,
      right: 2,
      child: 0xffffffff,
      start: 0,
      size: wordStream.length,
    }),
    buildDirectoryEntry({
      name: '1Table',
      type: 2,
      color: 1,
      left: 0xffffffff,
      right: 0xffffffff,
      child: 0xffffffff,
      start: wordMiniSectors,
      size: tableStream.length,
    }),
    Buffer.alloc(128, 0),
  ]);

  const miniFatBytes = Buffer.alloc(SECTOR_SIZE, 0);
  for (let index = 0; index < miniFat.length; index += 1) {
    miniFatBytes.writeUInt32LE(miniFat[index], index * 4);
  }

  // The header.
  const header = Buffer.alloc(SECTOR_SIZE, 0);
  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).copy(header, 0);
  header.writeUInt16LE(0x003e, 0x18); // minor version
  header.writeUInt16LE(0x0003, 0x1a); // major version
  header.writeUInt16LE(0xfffe, 0x1c); // byte order
  header.writeUInt16LE(9, 0x1e); // sector shift: 512 bytes
  header.writeUInt16LE(6, 0x20); // mini sector shift: 64 bytes
  header.writeUInt32LE(1, 0x2c); // the number of FAT sectors
  header.writeUInt32LE(1, 0x30); // the first directory sector
  header.writeUInt32LE(MINI_CUTOFF, 0x38);
  header.writeUInt32LE(2, 0x3c); // the first mini FAT sector
  header.writeUInt32LE(1, 0x40); // the number of mini FAT sectors
  header.writeUInt32LE(0xfffffffe, 0x44); // the first DIFAT sector
  header.writeUInt32LE(0, 0x48); // the number of DIFAT sectors
  header.writeUInt32LE(0, 0x4c); // the first FAT sector is in the header
  for (let index = 1; index < 109; index += 1) {
    header.writeUInt32LE(0xffffffff, 0x4c + index * 4);
  }

  const fatBytes = Buffer.alloc(SECTOR_SIZE, 0);
  for (let index = 0; index < fat.length; index += 1) {
    fatBytes.writeUInt32LE(fat[index], index * 4);
  }

  const miniStreamBytes = Buffer.alloc(miniStreamSectors * SECTOR_SIZE, 0);
  miniStream.copy(miniStreamBytes, 0);

  const file = Buffer.concat([header, fatBytes, directory, miniFatBytes, miniStreamBytes]);
  if (file.length > (totalSectors + 1) * SECTOR_SIZE) {
    throw new Error('the fixture grew past the sectors the header describes');
  }
  return file;
}
