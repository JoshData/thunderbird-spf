/*
 * DOMAINKEYS LIBRARY IN JAVASCRIPT
 *
 * Copyright 2005 Joshua Tauberer <http://razor.occams.info>
 *
 * Feel free to use this file however you want, but
 * credit would be nice.
 */

setMaxDigits(256); // for Bigint

var googleKey = "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC69TURXN3oNfz+G/m3g5rt4P6nsKmVgU1D6cw2X6BnxKJNlQKm10f8tMx6P6bN7juTR1BeD8ubaGqtzm2rWK4LiMJqhoQcwQziGbK1zp/MkdXZEWMCflLY6oUITrivK7JNOLXtZbdxJG2y/RAHGswKKyVhSP9niRsZF/IBr5p8uQIDAQAB";

//DER_Key(googleKey);

function DER_Key(bin64) {
	var der = b64ToOctets(googleKey);
	var obj = DER_Read(der, 0);
	
	//alert(biToDecimal(bin2BigInt(obj.data)));
	
	//var n = DER_Read(obj.data, 0);
	alert(biToDecimal(bin2BigInt(obj.data)));
	
	var e = DER_Read(obj.data, 0);
	alert(e.data.length);
}

function bin2BigInt(bytes) {
	var result = new BigInt();
	var j = 0;
	for (i = 0; i < bytes.length; i += 2)
		result.digits[j++] = (bytes[i]<<8) + bytes[i+1];
	return result;
}

function DER_Read(der, start) {
	var len, b, i;
	
	var identifier = der[start++];
	
	if ((identifier & 0x1F) == 31) {
		identifier = 0;
		while (true) {
			b = der[start++];
			identifier = (identifier << 7) + (b & 0x7F);
			if ((b >> 7) == 0) break;
		}
	}
	
	var length = der[start++];
	
	if ((length >> 7) == 0) {
		length = length & 0x7F;
	} else {
		len = length & 0x7f;
		length = 0;
		for (i = 0; i < len; i++) {
			b = [start++];
			length <<= 8;
			length += b;
		}
	}
	
	var ret = new Object();
	ret.id = identifier;
	ret.data = new Array(length);
	ret.position = start;
	arrayCopy(der, start, ret.data, 0, length);
	return ret;
}

function b64ToOctets(bin64) {
	// Initialize the table.
	var tab = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
	var map = Array(256);
	var i;
	for (i = 0; i < tab.length; i++)
		map[tab.charCodeAt(i)] = i;
	map["=".charCodeAt(0)] = 0;
	
	//       H      L H      L H      L H      L H      L H      L
	// BYTE: 11111111 22222222 33333333 44444444 55555555 66666666
	// B64:  11111122 22223333 33444444 55555566 66667777 77888888
	
	var ret = Array(bin64.length * 4/3 + 4);
	var j = 0;
	var b1, b2, b3;
	for (i = 0; i < bin64.length; i += 4) {
		b1 = (map[bin64.charCodeAt(i)] << 2) + (map[bin64.charCodeAt(i+1)] >> 4);
		b2 = ((map[bin64.charCodeAt(i+1)] & 15) << 4) + (map[bin64.charCodeAt(i+2)] >> 2);
		b3 = ((map[bin64.charCodeAt(i+2)] & 3) << 6) + (map[bin64.charCodeAt(i+3)]);
		ret[j++] = b1;
		ret[j++] = b2;
		ret[j++] = b3;
	}

	return ret;
}

function b64ToBigInt(bin64) {
	var bytes = b64ToOctets(bin64);

	var result = new BigInt();
	var j = 0;
	for (i = 0; i < bytes.length; i += 2)
		result.digits[j++] = (bytes[i]<<8) + bytes[i+1];

	return result;
}
