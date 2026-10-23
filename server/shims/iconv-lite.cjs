/**
 * UTF-8 iconv-lite replacement used ONLY when bundling for Cloudflare Pages
 * Functions.
 *
 * Why this exists
 * ---------------
 * `express` re-exports body-parser's parsers at import time
 * (`exports.json = bodyParser.json`), which evaluates body-parser's lazy
 * getters and pulls in raw-body -> iconv-lite. iconv-lite 0.4.x declares
 *
 *     "browser": { "./lib/streams": false, "./lib/extend-node": false }
 *
 * The Cloudflare Pages Functions bundler honours that `browser` field, so the
 * module substituted for `./lib/streams` is `{}` and iconv-lite crashes during
 * module evaluation:
 *
 *     TypeError: require_streams(...) is not a function
 *
 * Node never sees any of this because it ignores the `browser` field, which is
 * why the same code works locally and in the test suite.
 *
 * The `browser` mapping in the repository's package.json points `iconv-lite`
 * at this file for that bundler only. The application does not use body-parser
 * (see the body-reading middleware in `app.ts`), and this API only ever
 * handles UTF-8, so a UTF-8 implementation is complete for this codebase. If a
 * non-UTF-8 decoder is ever requested it throws instead of silently mangling
 * the data.
 */
'use strict';

const { StringDecoder } = require('string_decoder');
const { Transform } = require('stream');

function isUtf8(encoding) {
  const normalized = String(encoding || 'utf8').toLowerCase().replace(/[-_]/g, '');
  return normalized === 'utf8' || normalized === 'utf';
}

function assertUtf8(encoding) {
  if (!isUtf8(encoding)) {
    throw new Error(`iconv-lite: encoding "${encoding}" is not supported in this build`);
  }
}

function decode(buffer, encoding) {
  assertUtf8(encoding);
  return Buffer.from(buffer).toString('utf8');
}

function encode(text, encoding) {
  assertUtf8(encoding);
  return Buffer.from(String(text), 'utf8');
}

function encodingExists(encoding) {
  return isUtf8(encoding);
}

function getDecoder(encoding) {
  assertUtf8(encoding);
  const decoder = new StringDecoder('utf8');
  return {
    write(chunk) {
      return decoder.write(Buffer.from(chunk));
    },
    end(chunk) {
      return chunk === undefined ? decoder.end() : decoder.end(Buffer.from(chunk));
    },
  };
}

function getEncoder(encoding) {
  assertUtf8(encoding);
  return {
    write(chunk) {
      return Buffer.from(String(chunk), 'utf8');
    },
    end(chunk) {
      return chunk === undefined ? Buffer.alloc(0) : Buffer.from(String(chunk), 'utf8');
    },
  };
}

function decodeStream(encoding) {
  assertUtf8(encoding);
  const decoder = new StringDecoder('utf8');
  return new Transform({
    transform(chunk, _enc, callback) {
      callback(null, decoder.write(Buffer.from(chunk)));
    },
    flush(callback) {
      callback(null, decoder.end());
    },
  });
}

function encodeStream(encoding) {
  assertUtf8(encoding);
  return new Transform({
    transform(chunk, _enc, callback) {
      callback(null, Buffer.from(String(chunk), 'utf8'));
    },
  });
}

module.exports = {
  decode,
  encode,
  encodingExists,
  getDecoder,
  getEncoder,
  decodeStream,
  encodeStream,
  // iconv-lite exposes the default encoding as a property in some versions.
  defaultCharUnicode: '�',
  defaultCharSingleByte: '?',
};
