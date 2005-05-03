//queryDNS("xx.for.net", "A", function(data) { alert(data); } );

function queryDNS(host, recordtype, callback) {
	queryDNSRecursive("J.ROOT-SERVERS.NET", host, recordtype, callback, 0);
}

function queryDNSRecursive(server, host, recordtype, callback, hops) {
	if (hops == 10) {
		callback(null);
		return;
	}
	
	// Figure out who's responsible for this domain.
	queryDNSDirect(server, host, recordtype,
		// Got the answer
		function(data) {
			callback(data);
		},
		
		// Authority Server
		function(data) {
			queryDNSRecursive(data, host, recordtype, callback, hops+1);
		}
		);
}

function queryDNSDirect(server, host, recordtype, callback, authorityCallback) {
	var query =
		// HEADER
		  "00" // ID
		+ String.fromCharCode(1) // QR=0, OPCODE=0, AA=0, TC=0, RD=1 (Recursion desired)
		+ String.fromCharCode(0) // all zeroes
		+ DNS_wordToStr(1) // 1 query
		+ DNS_wordToStr(0) // ASCOUNT=0
		+ DNS_wordToStr(0) // NSCOUNT=0
		+ DNS_wordToStr(0) // ARCOUNT=0
		;
		
	var hostparts = host.split(".");
	for (var hostpartidx = 0; hostpartidx < hostparts.length; hostpartidx++)
		query += DNS_octetToStr(hostparts[hostpartidx].length) + hostparts[hostpartidx];
	query += DNS_octetToStr(0);
	if (recordtype == "A")
		query += DNS_wordToStr(1);
	else if (recordtype == "NS")
		query += DNS_wordToStr(2); 
	else if (recordtype == "CNAME")
		query += DNS_wordToStr(5); 
	else if (recordtype == "PTR")
		query += DNS_wordToStr(12); 
	else if (recordtype == "MX")
		query += DNS_wordToStr(15); 
	else if (recordtype == "TXT")
		query += DNS_wordToStr(16); 
	else
		throw "Invalid record type.";
	query += DNS_wordToStr(1); // IN
		
	// Prepend query message length
	query = DNS_wordToStr(query.length) + query;
	
	var listener = {
		msgsize : null,
		readcount : 0,
		responseHeader : "",
		responseBody : "",
		process : function(data){
			this.readcount += data.length;
			
			while (this.responseHeader.length < 14) {
				this.responseHeader += data.charAt(0);
				data = data.substr(1);
			}
			if (this.responseHeader.length == 14) {
				this.msgsize = DNS_strToWord(this.responseHeader.substr(0, 2));
				this.responseBody += data;
			}
			
			if (this.readcount >= this.msgsize+2) {
				this.responseHeader = this.responseHeader.substr(2); // chop the length field
				DNS_getRDData(this.responseHeader + this.responseBody, callback, authorityCallback, server);
				return false;
			}
			return true;
		}
	}

	var ex = DNS_readAllFromSocket(server, 53, query, listener);
	if (ex != null) {
	  alert(ex);
	}
}

function DNS_readDomain(ctx) {
	var domainname = "";
	while (true) {
		var l = ctx.str.charCodeAt(ctx.idx++);
		if (l == 0) break;
		
		if (domainname != "") domainname += ".";
		
		if ((l >> 6) == 3) {
			// Pointer
			var ptr = ((l & 63) << 8) + ctx.str.charCodeAt(ctx.idx++);
			var ctx2 = { str : ctx.str, idx : ptr };
			domainname += DNS_readDomain(ctx2);
			break;
		} else {
			domainname += ctx.str.substr(ctx.idx, l);
			ctx.idx += l;
		}
	}
	return domainname;
}

function DNS_getRDData(str, callback, authorityCallback, server) {
	var qcount = DNS_strToWord(str.substr(4, 2));
	var ancount = DNS_strToWord(str.substr(6, 2));
	var aucount = DNS_strToWord(str.substr(8, 2));
	
	var ctx = { str : str, idx : 12 };
	
	var i;
	for (i = 0; i < qcount; i++) {
		var dom = DNS_readDomain(ctx);
		var type = DNS_strToWord(str.substr(ctx.idx, 2)); ctx.idx += 2;
		var cls = DNS_strToWord(str.substr(ctx.idx, 2)); ctx.idx += 2;
	}
	
	for (i = 0; i < ancount; i++) {
		var dom = DNS_readDomain(ctx);
		var type = DNS_strToWord(str.substr(ctx.idx, 2)); ctx.idx += 2;
		var cls = DNS_strToWord(str.substr(ctx.idx, 2)); ctx.idx += 2;
		var ttl = DNS_strToWord(str.substr(ctx.idx, 2)); ctx.idx += 4; // 32bit
		var rdlen = DNS_strToWord(str.substr(ctx.idx, 2)); ctx.idx += 2;
		var rddata = str.substr(ctx.idx+1, rdlen-1);
		callback(rddata);
		return;
	}

	for (i = 0; i < aucount; i++) {
		var dom = DNS_readDomain(ctx);
		var type = DNS_strToWord(str.substr(ctx.idx, 2)); ctx.idx += 2;
		var cls = DNS_strToWord(str.substr(ctx.idx, 2)); ctx.idx += 2;
		var ttl = DNS_strToWord(str.substr(ctx.idx, 2)); ctx.idx += 4; // 32bit
		var rdlen = DNS_strToWord(str.substr(ctx.idx, 2)); ctx.idx += 2;
		var authdom = DNS_readDomain(ctx);
		if (authdom == server) { callback(null); return; } // no info available
		authorityCallback(authdom);
		return;
	}
}

function DNS_strToWord(str) {
	return str.charCodeAt(1) + (str.charCodeAt(0) << 8);
}

function DNS_strToOctet(str) {
	return str.charCodeAt(0);
}

function DNS_wordToStr(word) {
	return DNS_octetToStr((word >> 8) % 256) + DNS_octetToStr(word % 256);
}

function DNS_octetToStr(octet) {
	return String.fromCharCode(octet);
}

// This comes from http://xulplanet.com/tutorials/mozsdk/sockets.php

function DNS_readAllFromSocket(host,port,outputData,listener)
{
  try {
    var transportService =
      Components.classes["@mozilla.org/network/socket-transport-service;1"]
        .getService(Components.interfaces.nsISocketTransportService);
    var transport = transportService.createTransport(null,0,host,port,null);

    var outstream = transport.openOutputStream(0,0,0);
    outstream.write(outputData,outputData.length);

    var stream = transport.openInputStream(0,0,0);
    var instream = Components.classes["@mozilla.org/binaryinputstream;1"]
      .createInstance(Components.interfaces.nsIBinaryInputStream);
    instream.setInputStream(stream);

    var dataListener = {
		data : "",
		onStartRequest: function(request, context){},
		onStopRequest: function(request, context, status){
			outstream.close();
			stream.close();
			if (listener.finished != null) {
				listener.finished(this.data);
			}
		},
		onDataAvailable: function(request, context, inputStream, offset, count){
			for (var i = 0; i < count; i++) {
			  this.data += String.fromCharCode(instream.read8());
			}
			if (listener.process != null) {
				if (!listener.process(this.data)) {
					outstream.close();
					stream.close();
				}
				this.data = "";
			}
      }
    };
	
    var pump = Components.
      classes["@mozilla.org/network/input-stream-pump;1"].
        createInstance(Components.interfaces.nsIInputStreamPump);
    pump.init(stream, -1, -1, 0, 0, false);
    pump.asyncRead(dataListener,null);
  } catch (ex){
    return ex;
  }
  return null;
}

