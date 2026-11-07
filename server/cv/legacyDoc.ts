/**
 * Reading a legacy Word document.
 *
 * A `.doc` file is not a text file and not a zipped package: it is a
 * Compound File Binary container holding a Word document written in the
 * Word 97-2003 binary format. Two layers have to be peeled for the text to
 * come out:
 *
 *   1. the container. It is a small file system — a sector allocation table,
 *      a directory of named streams, and a second allocation table for the
 *      small streams. The document lives in the `WordDocument` stream and the
 *      piece table lives in `0Table` or `1Table`.
 *   2. the piece table. Word does not store its text as one block: it stores
 *      a list of pieces, each one a run of characters that is either 8-bit
 *      (the local code page) or 16-bit (Unicode), at its own offset in the
 *      file. The table says where the pieces are and how they join up.
 *
 * The result is read the same way a PDF is read: as text, in reading order,
 * with the paragraphs kept as paragraphs. Nothing about the layout survives,
 * because the binary format does not carry it in any form the studio could
 * use — so a `.doc` upload is reported as a single-column text document and
 * the review tells the candidate that the layout was not available.
 *
 * The reader is deliberately strict about the container it accepts and
 * forgiving about the document inside it: a file that is not a compound file
 * is rejected, and a compound file whose piece table cannot be read falls
 * back to a scan for readable runs rather than producing nothing at all.
 */

/* -------------------------------------------------------------------------- */
/* The compound file container                                                 */
/* -------------------------------------------------------------------------- */

/** The signature every compound file starts with. */
const OLE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

/** The size of the container header, which is never part of a sector. */
const HEADER_SIZE = 512;

/** The number of bytes in a directory entry. */
const DIRECTORY_ENTRY_SIZE = 128;

const ENDOFCHAIN = 0xfffffffe;
const FREESECT = 0xffffffff;

interface CompoundDirectoryEntry {
  name: string;
  /** 1 = storage, 2 = stream, 5 = the root storage. */
  type: number;
  startSector: number;
  size: number;
}

interface CompoundFile {
  data: Uint8Array;
  sectorSize: number;
  miniSectorSize: number;
  miniCutoff: number;
  fat: Uint32Array;
  miniFat: Uint32Array;
  directory: CompoundDirectoryEntry[];
  miniStream: Uint8Array;
}

function readU16(data: Uint8Array, offset: number): number {
  return (data[offset] ?? 0) | ((data[offset + 1] ?? 0) << 8);
}

function readU32(data: Uint8Array, offset: number): number {
  return (
    ((data[offset] ?? 0) |
      ((data[offset + 1] ?? 0) << 8) |
      ((data[offset + 2] ?? 0) << 16) |
      ((data[offset + 3] ?? 0) << 24)) >>>
    0
  );
}

/** True when the bytes are a compound file, whatever is inside it. */
export function hasLegacyDocSignature(buffer: Uint8Array): boolean {
  if (buffer.length < OLE_SIGNATURE.length) return false;
  return OLE_SIGNATURE.every((byte, index) => buffer[index] === byte);
}

/** The offset of a sector. Sector 0 follows the header. */
function sectorOffset(sector: number, sectorSize: number): number {
  return (sector + 1) * sectorSize;
}

/** Reads the sector allocation table out of the header's DIFAT. */
function readFat(data: Uint8Array, sectorSize: number, fatSectorCount: number, firstDifatSector: number): Uint32Array {
  const entriesPerSector = sectorSize / 4;
  const fat = new Uint32Array(fatSectorCount * entriesPerSector);

  // The first 109 FAT sector numbers are in the header itself.
  const difat: number[] = [];
  for (let i = 0; i < 109 && difat.length < fatSectorCount; i += 1) {
    const sector = readU32(data, 76 + i * 4);
    if (sector === FREESECT || sector === ENDOFCHAIN) break;
    difat.push(sector);
  }

  // The rest are in a chain of DIFAT sectors, each of which holds the
  // numbers of more FAT sectors.
  let difatSector = firstDifatSector;
  const difatGuard = new Set<number>();
  while (
    difatSector !== ENDOFCHAIN &&
    difatSector !== FREESECT &&
    difat.length < fatSectorCount &&
    !difatGuard.has(difatSector)
  ) {
    difatGuard.add(difatSector);
    const start = sectorOffset(difatSector, sectorSize);
    for (let i = 0; i < entriesPerSector - 1 && difat.length < fatSectorCount; i += 1) {
      const sector = readU32(data, start + i * 4);
      if (sector === FREESECT || sector === ENDOFCHAIN) break;
      difat.push(sector);
    }
    difatSector = readU32(data, start + (entriesPerSector - 1) * 4);
  }

  let cursor = 0;
  for (const fatSector of difat) {
    const start = sectorOffset(fatSector, sectorSize);
    for (let i = 0; i < entriesPerSector; i += 1) {
      if (cursor >= fat.length) break;
      fat[cursor] = readU32(data, start + i * 4);
      cursor += 1;
    }
  }

  return fat;
}

/** Follows an allocation chain and concatenates the sectors it visits. */
function readChain(
  data: Uint8Array,
  fat: Uint32Array,
  startSector: number,
  sectorSize: number,
  limit: number
): Uint8Array {
  const parts: Uint8Array[] = [];
  let sector = startSector;
  let total = 0;
  const visited = new Set<number>();

  while (sector !== ENDOFCHAIN && sector !== FREESECT && total < limit) {
    if (visited.has(sector)) break;
    visited.add(sector);
    const start = sectorOffset(sector, sectorSize);
    const part = data.subarray(start, Math.min(start + sectorSize, data.length));
    parts.push(part);
    total += part.length;
    sector = fat[sector] ?? ENDOFCHAIN;
  }

  const joined = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.length;
  }
  return joined;
}

/** Reads the mini stream, which holds every stream below the cutoff. */
function readMiniStream(
  data: Uint8Array,
  fat: Uint32Array,
  root: CompoundDirectoryEntry,
  sectorSize: number
): Uint8Array {
  if (root.startSector === ENDOFCHAIN || root.startSector === FREESECT) return new Uint8Array(0);
  return readChain(data, fat, root.startSector, sectorSize, root.size);
}

/** Reads a stream that is below the cutoff out of the mini stream. */
function readMiniChain(
  miniStream: Uint8Array,
  miniFat: Uint32Array,
  startSector: number,
  size: number,
  miniSectorSize: number
): Uint8Array {
  const parts: Uint8Array[] = [];
  let sector = startSector;
  let total = 0;
  const visited = new Set<number>();

  while (sector !== ENDOFCHAIN && sector !== FREESECT && total < size) {
    if (visited.has(sector)) break;
    visited.add(sector);
    const start = sector * miniSectorSize;
    const part = miniStream.subarray(start, Math.min(start + miniSectorSize, miniStream.length));
    parts.push(part);
    total += part.length;
    sector = miniFat[sector] ?? ENDOFCHAIN;
  }

  const joined = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.length;
  }
  // The chain is made of whole sectors, so it can be longer than the stream
  // itself. Only the stream is returned.
  return joined.subarray(0, Math.min(size, total));
}

/** Parses the container. Returns null when the bytes are not one. */
function readCompoundFile(data: Uint8Array): CompoundFile | null {
  if (!hasLegacyDocSignature(data)) return null;
  if (data.length < HEADER_SIZE + DIRECTORY_ENTRY_SIZE) return null;

  const sectorShift = readU16(data, 30);
  const miniSectorShift = readU16(data, 32);
  if (sectorShift < 7 || sectorShift > 20 || miniSectorShift < 4 || miniSectorShift > 12) {
    return null;
  }
  const sectorSize = 1 << sectorShift;
  const miniSectorSize = 1 << miniSectorShift;
  const miniCutoff = readU32(data, 56);
  const fatSectorCount = readU32(data, 44);
  const firstDirSector = readU32(data, 48);
  const firstMiniFatSector = readU32(data, 60);
  const firstDifatSector = readU32(data, 68);

  const fat = readFat(data, sectorSize, fatSectorCount, firstDifatSector);

  const directoryBytes = readChain(data, fat, firstDirSector, sectorSize, data.length);
  const directory: CompoundDirectoryEntry[] = [];
  for (let offset = 0; offset + DIRECTORY_ENTRY_SIZE <= directoryBytes.length; offset += DIRECTORY_ENTRY_SIZE) {
    const nameLength = readU16(directoryBytes, offset + 64);
    const type = directoryBytes[offset + 66];
    if (type !== 1 && type !== 2 && type !== 5) continue;
    let name = '';
    if (nameLength >= 2 && nameLength <= 64) {
      const characters: string[] = [];
      for (let i = 0; i + 1 < nameLength - 2; i += 2) {
        characters.push(String.fromCharCode(readU16(directoryBytes, offset + i)));
      }
      name = characters.join('');
    }
    directory.push({
      name,
      type,
      startSector: readU32(directoryBytes, offset + 116),
      size: readU32(directoryBytes, offset + 120),
    });
  }
  if (directory.length === 0) return null;

  const root = directory.find((entry) => entry.type === 5) ?? directory[0];
  const miniStream = readMiniStream(data, fat, root, sectorSize);

  let miniFat = new Uint32Array(0);
  if (firstMiniFatSector !== ENDOFCHAIN && firstMiniFatSector !== FREESECT) {
    const miniFatBytes = readChain(data, fat, firstMiniFatSector, sectorSize, data.length);
    miniFat = new Uint32Array(miniFatBytes.length / 4);
    for (let i = 0; i < miniFat.length; i += 1) miniFat[i] = readU32(miniFatBytes, i * 4);
  }

  return { data, sectorSize, miniSectorSize, miniCutoff, fat, miniFat, directory, miniStream };
}

/** Reads one named stream out of the container. */
function readStream(file: CompoundFile, name: string): Uint8Array | null {
  const entry = file.directory.find(
    (candidate) => candidate.type === 2 && candidate.name.toLowerCase() === name.toLowerCase()
  );
  if (!entry) return null;
  if (entry.size === 0) return new Uint8Array(0);
  if (entry.size < file.miniCutoff) {
    return readMiniChain(file.miniStream, file.miniFat, entry.startSector, entry.size, file.miniSectorSize);
  }
  return readChain(file.data, file.fat, entry.startSector, file.sectorSize, entry.size).subarray(0, entry.size);
}

/* -------------------------------------------------------------------------- */
/* The Word document                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The code page bytes in a legacy document.
 *
 * The 8-bit pieces of a Word document are written in the local code page.
 * For the characters that matter in a CV — the typographic punctuation and
 * the symbols — the Windows-1252 reading is the one every word processor on
 * every platform agrees on.
 */
const CP1252_HIGH: Record<number, string> = {
  0x80: '€',
  0x82: '‚',
  0x83: 'ƒ',
  0x84: '„',
  0x85: '…',
  0x86: '†',
  0x87: '‡',
  0x88: 'ˆ',
  0x89: '‰',
  0x8a: 'Š',
  0x8b: '‹',
  0x8c: 'Œ',
  0x8e: 'Ž',
  0x91: '‘',
  0x92: '’',
  0x93: '“',
  0x94: '”',
  0x95: '•',
  0x96: '–',
  0x97: '—',
  0x98: '˜',
  0x99: '™',
  0x9a: 'š',
  0x9b: '›',
  0x9c: 'œ',
  0x9e: 'ž',
  0x9f: 'Ÿ',
};

function decodeCodePage(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) {
    if (byte < 0x80) {
      out += String.fromCharCode(byte);
    } else if (byte >= 0xa0) {
      out += String.fromCharCode(byte);
    } else {
      out += CP1252_HIGH[byte] ?? '';
    }
  }
  return out;
}

function decodeUtf16Le(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    out += String.fromCharCode(bytes[i] | (bytes[i + 1] << 8));
  }
  return out;
}

/**
 * The characters Word uses for its own marks.
 *
 * A paragraph ends with a carriage return, a table cell ends with a bell, a
 * line break is a vertical tab, a page break is a form feed, and the field
 * codes are wrapped around the field result. None of them are text the
 * candidate wrote.
 */
function cleanWordText(text: string): string {
  let out = '';
  let inFieldCode = false;
  for (const character of text) {
    const code = character.charCodeAt(0);
    if (code === 0x13) {
      inFieldCode = true;
      continue;
    }
    if (code === 0x14) {
      inFieldCode = false;
      continue;
    }
    if (code === 0x15) {
      inFieldCode = false;
      continue;
    }
    if (inFieldCode) continue;
    if (code === 0x07) {
      out += '\n';
      continue;
    }
    if (code === 0x0b || code === 0x0c) {
      out += '\n';
      continue;
    }
    if (code === 0x0d) {
      out += '\n';
      continue;
    }
    if (code === 0x1e) {
      out += '-';
      continue;
    }
    if (code === 0x1f) continue;
    if (code === 0x01 || code === 0x02 || code === 0x03 || code === 0x04 || code === 0x05 || code === 0x08) {
      continue;
    }
    out += character;
  }
  return out;
}

/** Reads the text out of the piece table. */
function readPieceTable(table: Uint8Array, word: Uint8Array): string | null {
  if (table.length < 5) return null;

  let offset = 0;
  while (offset < table.length) {
    const kind = table[offset];
    if (kind === 0x01) {
      // A property modifier: skipped over, it holds formatting, not text.
      const size = readU16(table, offset + 1);
      offset += 3 + Math.abs(size);
      continue;
    }
    if (kind === 0x02) {
      const size = readU32(table, offset + 1);
      const plc = table.subarray(offset + 5, offset + 5 + size);
      return textFromPieceTable(plc, word);
    }
    return null;
  }
  return null;
}

/** Turns the piece table into the text it describes. */
function textFromPieceTable(plc: Uint8Array, word: Uint8Array): string | null {
  if (plc.length < 16) return null;
  const pieceCount = Math.floor((plc.length - 4) / 12);
  if (pieceCount <= 0) return null;

  const text: string[] = [];
  const charactersBase = 0;
  const pieceBase = (pieceCount + 1) * 4;

  for (let index = 0; index < pieceCount; index += 1) {
    const startCharacter = readU32(plc, charactersBase + index * 4);
    const endCharacter = readU32(plc, charactersBase + (index + 1) * 4);
    const length = endCharacter - startCharacter;
    if (length <= 0) continue;

    const descriptor = pieceBase + index * 8;
    const fileOffset = readU32(plc, descriptor + 2);
    const compressed = (fileOffset & 0x40000000) !== 0;
    const offset = compressed ? (fileOffset & 0x3fffffff) / 2 : fileOffset & 0x3fffffff;

    if (compressed) {
      text.push(decodeCodePage(word.subarray(offset, offset + length)));
    } else {
      text.push(decodeUtf16Le(word.subarray(offset, offset + length * 2)));
    }
  }

  return text.join('');
}

/**
 * Reads the text of a legacy Word document.
 *
 * Returns null when the bytes are not a document this reader understands, so
 * the caller can tell "this is not a .doc" from "this .doc had no text".
 */
export function extractLegacyDocText(buffer: Uint8Array): string | null {
  const file = readCompoundFile(buffer);
  if (!file) return null;

  const word = readStream(file, 'WordDocument');
  if (!word || word.length < 0x200) return null;

  // The file information block says which of the two table streams holds the
  // piece table. Both are read when the flag is missing, because a few
  // writers get it wrong.
  const flags = readU16(word, 0x0a);
  const preferred = (flags & 0x0200) !== 0 ? '1Table' : '0Table';
  const other = preferred === '1Table' ? '0Table' : '1Table';

  // The pair of offsets of the piece table sits at a fixed place in the
  // information block of every Word 97 and later document.
  const pairCount = readU16(word, 0x98);
  if (pairCount <= 33) return null;
  const clxOffset = readU32(word, 0x01a2);
  const clxLength = readU32(word, 0x01a6);
  if (clxLength === 0) return null;

  for (const tableName of [preferred, other]) {
    const table = readStream(file, tableName);
    if (!table || table.length < clxOffset + clxLength) continue;
    const text = readPieceTable(table.subarray(clxOffset, clxOffset + clxLength), word);
    if (text && text.trim().length > 0) return cleanWordText(text);
  }

  return null;
}

/**
 * Scans a document for readable text when the piece table cannot be read.
 *
 * This is the last resort: it reads the runs of characters a human would
 * recognise, in the order they appear, and drops everything else. It is
 * better than an empty document and worse than a real one, which is why the
 * caller is told that the text was recovered approximately.
 */
export function scanReadableText(buffer: Uint8Array): string {
  const runs: string[] = [];
  let current = '';
  let index = 0;

  const flush = () => {
    const trimmed = current.trim();
    if (trimmed.length >= 4) runs.push(trimmed);
    current = '';
  };

  while (index < buffer.length) {
    const byte = buffer[index];
    if (byte >= 0x20 && byte < 0x7f) {
      current += String.fromCharCode(byte);
      index += 1;
      continue;
    }
    if (byte === 0x0d || byte === 0x0a) {
      flush();
      index += 1;
      continue;
    }
    // A run of 16-bit characters: the byte after is zero and the one after
    // that is printable.
    if (
      byte === 0x00 &&
      index + 2 < buffer.length &&
      buffer[index + 1] >= 0x20 &&
      buffer[index + 1] < 0x7f &&
      buffer[index + 2] === 0x00
    ) {
      current += String.fromCharCode(buffer[index + 1]);
      index += 3;
      continue;
    }
    flush();
    index += 1;
  }
  flush();

  return runs.join('\n');
}
