// SHA1 and SHA256, based on:

/*
 * A JavaScript implementation of the Secure Hash Algorithm, SHA-1, as defined
 * in FIPS PUB 180-1
 * Version 2.1 Copyright Paul Johnston 2000 - 2002.
 * Other contributors: Greg Holt, Andrew Kepert, Ydnar, Lostinet
 * Distributed under the BSD License
 * See http://pajhome.org.uk/crypt/md5 for details.
 */

/**
*
*  Secure Hash Algorithm (SHA256)
*  http://www.webtoolkit.info/
*
*  Original code by Angel Marin, Paul Johnston.
*
**/

/*
 * Configurable variables. You may need to tweak these to be compatible with
 * the server-side, but the defaults work in most cases.
 */
var hexcase = 0;  /* hex output format. 0 - lowercase; 1 - uppercase        */
var b64pad  = ""; /* base-64 pad character. "=" for strict RFC compliance   */
var chrsz   = 8;  /* bits per input character. 8 - ASCII; 16 - Unicode      */

// State variables for incremental computation of hash
var incremental_w;
var incremental_a;
var incremental_b;
var incremental_c;
var incremental_d;
var incremental_e;
var incremental_bits;
var incremental_size;
var incremental_hash;

//////// Test Functions ////////

function sha1_incremental_test()
{
  var a = "abcdefghijklmnopqrstuvwxyz012345ABCDEFGHIJKLMNOPQRSTUVWXYZ678901";
  var b = "109876ZYXWVUTSRQPONMLKJIHGFEDCBA543210zyxwvutsrqponmlkjihgfedcba";
  var c = "abcdefghijklmnopqrstuvwxyz";
	
  sha1_incremental_init();
  sha1_incremental_block(a, false);
  sha1_incremental_block(b, false);
  sha1_incremental_block(c, true);
  return hex_sha1(a + b + c) == sha1_incremental_end_hex();
}

function sha256_incremental_test()
{
  var a = "abcdefghijklmnopqrstuvwxyz012345ABCDEFGHIJKLMNOPQRSTUVWXYZ678901";
  var b = "109876ZYXWVUTSRQPONMLKJIHGFEDCBA543210zyxwvutsrqponmlkjihgfedcba";
  var c = "abcdefghijklmnopqrstuvwxyz";
	
  sha256_incremental_init();
  sha256_incremental_block(a, false);
  sha256_incremental_block(b, false);
  sha256_incremental_block(c, true);
  return hex_sha256(a + b + c) == sha256_incremental_end_hex();
}

function sha1_test()
{
  return hex_sha1("abc") == "a9993e364706816aba3e25717850c26c9cd0d89d";
}

//////// Wrapper Functions ////////

function hex_sha1(s){return binb2hex(core_sha1(str2binb(s),s.length * chrsz));}
function b64_sha1(s){return binb2b64(core_sha1(str2binb(s),s.length * chrsz));}
function str_sha1(s){return binb2str(core_sha1(str2binb(s),s.length * chrsz));}
function hex_hmac_sha1(key, data){ return binb2hex(core_hmac_sha1(key, data));}
function b64_hmac_sha1(key, data){ return binb2b64(core_hmac_sha1(key, data));}
function str_hmac_sha1(key, data){ return binb2str(core_hmac_sha1(key, data));}

function hex_sha256(s){return binb2hex(core_sha256(str2binb(s),s.length * chrsz));}
function b64_sha256(s){return binb2b64(core_sha256(str2binb(s),s.length * chrsz));}
function str_sha256(s){return binb2str(core_sha256(str2binb(s),s.length * chrsz));}

//////// SHA1 Functions ////////

function sha1_incremental_init()
{
  incremental_w = Array(80);
  incremental_a =  1732584193;
  incremental_b = -271733879;
  incremental_c = -1732584194;
  incremental_d =  271733878;
  incremental_e = -1009589776;
  incremental_bits = 0;
  incremental_size = 0;
}

function sha1_incremental_block(s, end) { core_sha1_incremental_block(str2binb(s),s.length * chrsz,end); }

function sha1_incremental_end_hex() { return binb2hex(core_sha1_incremental_end()); }
function sha1_incremental_end_base64() { return binb2b64(core_sha1_incremental_end()); }

function core_sha1_incremental_block(x, blocklen, end)
{
  incremental_bits += blocklen;
  
  if (end) {
    /* append padding */
    x[(incremental_bits >> 5) - incremental_size] |= 0x80 << (24 - incremental_bits % 32);
    x[((incremental_bits + 64 >> 9) << 4) + 15 - incremental_size] = incremental_bits;
  } else {
	  if ((blocklen % 512) != 0)
		  alert("SHA1 incremental block lengths must be multiples of 64 characters.");
  }

  incremental_size += x.length;
	
  for(var i = 0; i < x.length; i += 16)
  {
    var olda = incremental_a;
    var oldb = incremental_b;
    var oldc = incremental_c;
    var oldd = incremental_d;
    var olde = incremental_e;

    for(var j = 0; j < 80; j++)
    {
      if(j < 16) incremental_w[j] = x[i + j];
      else incremental_w[j] = rol(incremental_w[j-3] ^ incremental_w[j-8] ^ incremental_w[j-14] ^ incremental_w[j-16], 1);
      var t = safe_add(safe_add(rol(incremental_a, 5), sha1_ft(j, incremental_b, incremental_c, incremental_d)), 
                       safe_add(safe_add(incremental_e, incremental_w[j]), sha1_kt(j)));
      incremental_e = incremental_d;
      incremental_d = incremental_c;
      incremental_c = rol(incremental_b, 30);
      incremental_b = incremental_a;
      incremental_a = t;
    }

    incremental_a = safe_add(incremental_a, olda);
    incremental_b = safe_add(incremental_b, oldb);
    incremental_c = safe_add(incremental_c, oldc);
    incremental_d = safe_add(incremental_d, oldd);
    incremental_e = safe_add(incremental_e, olde);
  }
}

function core_sha1_incremental_end() {  
    return Array(incremental_a, incremental_b, incremental_c, incremental_d, incremental_e);  
}

/*
 * Calculate the SHA-1 of an array of big-endian words, and a bit length
 */
function core_sha1(x, len)
{
  /* append padding */
  x[len >> 5] |= 0x80 << (24 - len % 32);
  x[((len + 64 >> 9) << 4) + 15] = len;

  var w = Array(80);
  var a =  1732584193;
  var b = -271733879;
  var c = -1732584194;
  var d =  271733878;
  var e = -1009589776;

  for(var i = 0; i < x.length; i += 16)
  {
    var olda = a;
    var oldb = b;
    var oldc = c;
    var oldd = d;
    var olde = e;

    for(var j = 0; j < 80; j++)
    {
      if(j < 16) w[j] = x[i + j];
      else w[j] = rol(w[j-3] ^ w[j-8] ^ w[j-14] ^ w[j-16], 1);
      var t = safe_add(safe_add(rol(a, 5), sha1_ft(j, b, c, d)), 
                       safe_add(safe_add(e, w[j]), sha1_kt(j)));
      e = d;
      d = c;
      c = rol(b, 30);
      b = a;
      a = t;
    }

    a = safe_add(a, olda);
    b = safe_add(b, oldb);
    c = safe_add(c, oldc);
    d = safe_add(d, oldd);
    e = safe_add(e, olde);
  }
  return Array(a, b, c, d, e);
  
}

//////// SHA256 Functions ////////

function sha256_incremental_init() {
  incremental_hash = new Array(0x6A09E667, 0xBB67AE85, 0x3C6EF372, 0xA54FF53A, 0x510E527F, 0x9B05688C, 0x1F83D9AB, 0x5BE0CD19);
  incremental_bits = 0;
  incremental_size = 0;
}

function sha256_incremental_block(s, end) { core_sha256_incremental_block(str2binb(s),s.length * chrsz,end); }

function sha256_incremental_end_hex() { return binb2hex(core_sha256_incremental_end()); }
function sha256_incremental_end_base64() { return binb2b64(core_sha256_incremental_end()); }

function core_sha256_incremental_block (m, blocklen, end) {
  var K = new Array(0x428A2F98, 0x71374491, 0xB5C0FBCF, 0xE9B5DBA5, 0x3956C25B, 0x59F111F1, 0x923F82A4, 0xAB1C5ED5, 0xD807AA98, 0x12835B01, 0x243185BE, 0x550C7DC3, 0x72BE5D74, 0x80DEB1FE, 0x9BDC06A7, 0xC19BF174, 0xE49B69C1, 0xEFBE4786, 0xFC19DC6, 0x240CA1CC, 0x2DE92C6F, 0x4A7484AA, 0x5CB0A9DC, 0x76F988DA, 0x983E5152, 0xA831C66D, 0xB00327C8, 0xBF597FC7, 0xC6E00BF3, 0xD5A79147, 0x6CA6351, 0x14292967, 0x27B70A85, 0x2E1B2138, 0x4D2C6DFC, 0x53380D13, 0x650A7354, 0x766A0ABB, 0x81C2C92E, 0x92722C85, 0xA2BFE8A1, 0xA81A664B, 0xC24B8B70, 0xC76C51A3, 0xD192E819, 0xD6990624, 0xF40E3585, 0x106AA070, 0x19A4C116, 0x1E376C08, 0x2748774C, 0x34B0BCB5, 0x391C0CB3, 0x4ED8AA4A, 0x5B9CCA4F, 0x682E6FF3, 0x748F82EE, 0x78A5636F, 0x84C87814, 0x8CC70208, 0x90BEFFFA, 0xA4506CEB, 0xBEF9A3F7, 0xC67178F2);
  var W = new Array(64);
  var a, b, c, d, e, f, g, h, i, j;
  var T1, T2;

  incremental_bits += blocklen;
  
  if (end) {
    /* append padding */
    m[(incremental_bits >> 5) - incremental_size] |= 0x80 << (24 - incremental_bits % 32);
    m[((incremental_bits + 64 >> 9) << 4) + 15 - incremental_size] = incremental_bits;
  } else {
	  if ((blocklen % 512) != 0)
		  alert("SHA256 incremental block lengths must be multiples of 64 characters.");
  }

  incremental_size += m.length;

  for (var i = 0; i<m.length; i+=16 ) {
		a = incremental_hash[0];
		b = incremental_hash[1];
		c = incremental_hash[2];
		d = incremental_hash[3];
		e = incremental_hash[4];
		f = incremental_hash[5];
		g = incremental_hash[6];
		h = incremental_hash[7];

		for (var j = 0; j<64; j++) {
			 if (j < 16) W[j] = m[j + i];
			 else W[j] = safe_add(safe_add(safe_add(sha256_Gamma1256(W[j - 2]), W[j - 7]), sha256_Gamma0256(W[j - 15])), W[j - 16]);

			 T1 = safe_add(safe_add(safe_add(safe_add(h, sha256_Sigma1256(e)), sha256_Ch(e, f, g)), K[j]), W[j]);
			 T2 = safe_add(sha256_Sigma0256(a), sha256_Maj(a, b, c));

			 h = g;
			 g = f;
			 f = e;
			 e = safe_add(d, T1);
			 d = c;
			 c = b;
			 b = a;
			 a = safe_add(T1, T2);
		}

		incremental_hash[0] = safe_add(a, incremental_hash[0]);
		incremental_hash[1] = safe_add(b, incremental_hash[1]);
		incremental_hash[2] = safe_add(c, incremental_hash[2]);
		incremental_hash[3] = safe_add(d, incremental_hash[3]);
		incremental_hash[4] = safe_add(e, incremental_hash[4]);
		incremental_hash[5] = safe_add(f, incremental_hash[5]);
		incremental_hash[6] = safe_add(g, incremental_hash[6]);
		incremental_hash[7] = safe_add(h, incremental_hash[7]);
  }
}

function core_sha256_incremental_end() {  
    return incremental_hash;  
}

function core_sha256 (m, l) {
  var K = new Array(0x428A2F98, 0x71374491, 0xB5C0FBCF, 0xE9B5DBA5, 0x3956C25B, 0x59F111F1, 0x923F82A4, 0xAB1C5ED5, 0xD807AA98, 0x12835B01, 0x243185BE, 0x550C7DC3, 0x72BE5D74, 0x80DEB1FE, 0x9BDC06A7, 0xC19BF174, 0xE49B69C1, 0xEFBE4786, 0xFC19DC6, 0x240CA1CC, 0x2DE92C6F, 0x4A7484AA, 0x5CB0A9DC, 0x76F988DA, 0x983E5152, 0xA831C66D, 0xB00327C8, 0xBF597FC7, 0xC6E00BF3, 0xD5A79147, 0x6CA6351, 0x14292967, 0x27B70A85, 0x2E1B2138, 0x4D2C6DFC, 0x53380D13, 0x650A7354, 0x766A0ABB, 0x81C2C92E, 0x92722C85, 0xA2BFE8A1, 0xA81A664B, 0xC24B8B70, 0xC76C51A3, 0xD192E819, 0xD6990624, 0xF40E3585, 0x106AA070, 0x19A4C116, 0x1E376C08, 0x2748774C, 0x34B0BCB5, 0x391C0CB3, 0x4ED8AA4A, 0x5B9CCA4F, 0x682E6FF3, 0x748F82EE, 0x78A5636F, 0x84C87814, 0x8CC70208, 0x90BEFFFA, 0xA4506CEB, 0xBEF9A3F7, 0xC67178F2);
  var HASH = new Array(0x6A09E667, 0xBB67AE85, 0x3C6EF372, 0xA54FF53A, 0x510E527F, 0x9B05688C, 0x1F83D9AB, 0x5BE0CD19);
  var W = new Array(64);
  var a, b, c, d, e, f, g, h, i, j;
  var T1, T2;

  m[l >> 5] |= 0x80 << (24 - l % 32);
  m[((l + 64 >> 9) << 4) + 15] = l;

  for (var i = 0; i<m.length; i+=16 ) {
		a = HASH[0];
		b = HASH[1];
		c = HASH[2];
		d = HASH[3];
		e = HASH[4];
		f = HASH[5];
		g = HASH[6];
		h = HASH[7];

		for (var j = 0; j<64; j++) {
			 if (j < 16) W[j] = m[j + i];
			 else W[j] = safe_add(safe_add(safe_add(sha256_Gamma1256(W[j - 2]), W[j - 7]), sha256_Gamma0256(W[j - 15])), W[j - 16]);

			 T1 = safe_add(safe_add(safe_add(safe_add(h, sha256_Sigma1256(e)), sha256_Ch(e, f, g)), K[j]), W[j]);
			 T2 = safe_add(sha256_Sigma0256(a), sha256_Maj(a, b, c));

			 h = g;
			 g = f;
			 f = e;
			 e = safe_add(d, T1);
			 d = c;
			 c = b;
			 b = a;
			 a = safe_add(T1, T2);
		}

		HASH[0] = safe_add(a, HASH[0]);
		HASH[1] = safe_add(b, HASH[1]);
		HASH[2] = safe_add(c, HASH[2]);
		HASH[3] = safe_add(d, HASH[3]);
		HASH[4] = safe_add(e, HASH[4]);
		HASH[5] = safe_add(f, HASH[5]);
		HASH[6] = safe_add(g, HASH[6]);
		HASH[7] = safe_add(h, HASH[7]);
  }
  return HASH;
}

//////// Helper Functions ////////

/*
 * Perform the appropriate triplet combination function for the current
 * iteration
 */
function sha1_ft(t, b, c, d)
{
  if(t < 20) return (b & c) | ((~b) & d);
  if(t < 40) return b ^ c ^ d;
  if(t < 60) return (b & c) | (b & d) | (c & d);
  return b ^ c ^ d;
}

/*
 * Determine the appropriate additive constant for the current iteration
 */
function sha1_kt(t)
{
  return (t < 20) ?  1518500249 : (t < 40) ?  1859775393 :
         (t < 60) ? -1894007588 : -899497514;
}  

function sha256_S (X, n) { return ( X >>> n ) | (X << (32 - n)); }
function sha256_R (X, n) { return ( X >>> n ); }
function sha256_Ch(x, y, z) { return ((x & y) ^ ((~x) & z)); }
function sha256_Maj(x, y, z) { return ((x & y) ^ (x & z) ^ (y & z)); }
function sha256_Sigma0256(x) { return (sha256_S(x, 2) ^ sha256_S(x, 13) ^ sha256_S(x, 22)); }
function sha256_Sigma1256(x) { return (sha256_S(x, 6) ^ sha256_S(x, 11) ^ sha256_S(x, 25)); }
function sha256_Gamma0256(x) { return (sha256_S(x, 7) ^ sha256_S(x, 18) ^ sha256_R(x, 3)); }
function sha256_Gamma1256(x) { return (sha256_S(x, 17) ^ sha256_S(x, 19) ^ sha256_R(x, 10)); }

/*
 * Calculate the HMAC-SHA1 of a key and some data
 */
function core_hmac_sha1(key, data)
{
  var bkey = str2binb(key);
  if(bkey.length > 16) bkey = core_sha1(bkey, key.length * chrsz);

  var ipad = Array(16), opad = Array(16);
  for(var i = 0; i < 16; i++) 
  {
    ipad[i] = bkey[i] ^ 0x36363636;
    opad[i] = bkey[i] ^ 0x5C5C5C5C;
  }

  var hash = core_sha1(ipad.concat(str2binb(data)), 512 + data.length * chrsz);
  return core_sha1(opad.concat(hash), 512 + 160);
}

/*
 * Add integers, wrapping at 2^32. This uses 16-bit operations internally
 * to work around bugs in some JS interpreters.
 */
function safe_add(x, y)
{
  var lsw = (x & 0xFFFF) + (y & 0xFFFF);
  var msw = (x >> 16) + (y >> 16) + (lsw >> 16);
  return (msw << 16) | (lsw & 0xFFFF);
}

/*
 * Bitwise rotate a 32-bit number to the left.
 */
function rol(num, cnt)
{
  return (num << cnt) | (num >>> (32 - cnt));
}

//////// String/Binary Functions ////////


/*
 * Convert an 8-bit or 16-bit string to an array of big-endian words
 * In 8-bit function, characters >255 have their hi-byte silently ignored.
 */
function str2binb(str)
{
  var bin = Array();
  var mask = (1 << chrsz) - 1;
  var i;
  for(i = 0; i < ((str.length * chrsz - 1) >> 5) + 1; i++)
	  bin[i] = 0;
  for(i = 0; i < str.length * chrsz; i += chrsz)
    bin[i>>5] |= (str.charCodeAt(i / chrsz) & mask) << (24 - i%32);
  return bin;
}

/*
 * Convert an array of big-endian words to a string
 */
function binb2str(bin)
{
  var str = "";
  var mask = (1 << chrsz) - 1;
  for(var i = 0; i < bin.length * 32; i += chrsz)
    str += String.fromCharCode((bin[i>>5] >>> (24 - i%32)) & mask);
  return str;
}

/*
 * Convert an array of big-endian words to a hex string.
 */
function binb2hex(binarray)
{
  var hex_tab = hexcase ? "0123456789ABCDEF" : "0123456789abcdef";
  var str = "";
  for(var i = 0; i < binarray.length * 4; i++)
  {
    str += hex_tab.charAt((binarray[i>>2] >> ((3 - i%4)*8+4)) & 0xF) +
           hex_tab.charAt((binarray[i>>2] >> ((3 - i%4)*8  )) & 0xF);
  }
  return str;
}

/*
 * Convert an array of big-endian words to a base-64 string
 */
function binb2b64(binarray)
{
  var tab = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var str = "";
  for(var i = 0; i < binarray.length * 4; i += 3)
  {
    var triplet = (((binarray[i   >> 2] >> 8 * (3 -  i   %4)) & 0xFF) << 16)
                | (((binarray[i+1 >> 2] >> 8 * (3 - (i+1)%4)) & 0xFF) << 8 )
                |  ((binarray[i+2 >> 2] >> 8 * (3 - (i+2)%4)) & 0xFF);
    for(var j = 0; j < 4; j++)
    {
      if(i * 8 + j * 6 > binarray.length * 32) str += b64pad;
      else str += tab.charAt((triplet >> 6*(3-j)) & 0x3F);
    }
  }
  return str;
}
