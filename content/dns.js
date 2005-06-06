/*
 * DNS LIBRARY IN JAVASCRIPT
 *
 * Copyright 2005 Joshua Tauberer <tauberer@for.net>
 *
 * Feel free to use this file however you want, but
 * credit would be nice.
 */

var DNS_ROOT_NAME_SERVER = "J.ROOT-SERVERS.NET";
var DNS_ALLOW_RECURSION = 1;

var DNS_CACHE_SIZE = 1000;

var dnsCache = Array(DNS_CACHE_SIZE);
var dnsCachePos = 0;

DNS_LoadPrefs();

function DNS_LoadPrefs() {
	var prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch);

	if (prefs.getPrefType("dns.nameserver") == prefs.PREF_STRING
		&& prefs.getCharPref("dns.nameserver") != null && prefs.getCharPref("dns.nameserver") != "") {
		DNS_ROOT_NAME_SERVER = prefs.getCharPref("dns.nameserver");
		DNS_ALLOW_RECURSION = 0; // When our own name server has no answer
								  // for us, but gives us an authority server,
								  // we don't want to follow it to see if it
								  // has an answer.
	}
}

var dns_test_domains = Array("for.net", "www.for.net", "yy.for.net", "www.gmail.net");
var dns_test_domidx = 0;
//DNS_Test();
function DNS_Test() {
	queryDNS(dns_test_domains[dns_test_domidx], "MX",
		function(data) {
			var str;
			var i;
			if (data == null) { str = "no data"; }
			else {
				for (i = 0; i < data.length; i++) {
					if (data[i].host != null)
						data[i] = "host=" + data[i].host + ";address=" + data[i].address;
					
					if (str != null) str += ", "; else str = "";
					str += data[i];
				}
			}
			
			alert(dns_test_domains[dns_test_domidx] + " => " + str);
			dns_test_domidx++;
			DNS_Test();
		} );
}

//queryDNS("www.for.net", "A", function(data) { alert(data); } );
//queryDNS("yy.for.net", "A", function(data) { alert(data); } );
//queryDNS("www.gmail.com", "A", function(data) { alert(data); } );

// queryDNS: This is the main entry point for external callers.
function queryDNS(host, recordtype, callback, callbackdata) {
	var server = DNS_ROOT_NAME_SERVER;
	var authlen = 0;
	
	// Check if an authority exists pertaining to this host.
	for (var c = 0; c < dnsCache.length; c++) {
		if (dnsCache[c] == null) break;
		if (dnsCache[c].domain == host) { server = dnsCache[c].authority; break; }
		if (endsWith(host, "." + dnsCache[c].domain) && dnsCache[c].domain.length > authlen) {
			server = dnsCache[c].authority;
			authlen = dnsCache[c].domain.length;
		}
	}
	
	queryDNSRecursive(server, host, recordtype, callback, callbackdata, 0);
}

function reverseDNS(ip, callback, callbackdata) {
	// Get a list of reverse-DNS hostnames,
	// and then make sure that each hostname
	// resolves to the original IP.
	
	queryDNS(DNS_ReverseIPHostname(ip), "PTR",
		function(hostnames) {
			// No reverse DNS info available.
			if (hostnames == null) { callback(null, callbackdata); return; }
			
			var ret = Array(0);
			var retctr = 0;
			var resolvectr = 0;
			
			var i;
			
			// Check that each one resolves forward.
			for (i = 0; i < hostnames.length; i++) {
				var curhostname = hostnames[i];
				
				queryDNS(hostnames[i], "A",
				function(arecs) {
					if (arecs != null) {
						var j;
						var matched = false;
						for (j = 0; j < arecs.length; j++) {
							if (arecs[j] == ip) { matched = true; break; }
						}
					}
					
					if (matched)
						ret[retctr++] = curhostname;
					
					if (++resolvectr == hostnames.length) {
						if (retctr == 0)
							callback(null, callbackdata);
						else
							callback(ret, callbackdata);
					}
				});
			}
		});
}

function DNS_ReverseIPHostname(ip) {
	var q = ip.split(".");  // The "1*" forces the first term to be numeric
	return q[3] + "." + q[2] + "." + q[1] + "." + q[0] + ".in-addr.arpa";
}


function dnsCacheItem(domain, authority) {
	this.domain = domain;
	this.authority = authority;
}

function queryDNSRecursive(server, host, recordtype, callback, callbackdata, hops) {
	if (hops == 10) {
		DNS_Debug("DNS: Maximum number of recursive steps taken in resolving " + host);
		callback(null, callbackdata);
		return;
	}
	
	// Figure out who's responsible for this domain.
	queryDNSDirect(server, host, recordtype,
		// Got the answer
		function(data, innercallbackdata) {
			DNS_Debug("DNS: Resolved " + host + " " + recordtype + ": " + data);
			callback(data, innercallbackdata);
		},
		
		// Authority Server
		function(domain, authority, innercallbackdata) {
			//DNS_Debug("DNS: Got authority " + authority + " for domain " + domain + " while querying " + server + " for " + host + " " + recordtype);
			
			// Cache this authority record.
			dnsCache[dnsCachePos] = new dnsCacheItem(domain, authority);
			dnsCachePos = (++dnsCachePos) % dnsCache.length;
			
			// Recurse on the authority.
			queryDNSRecursive(authority, host, recordtype, callback, innercallbackdata, hops+1);
		},
		
		callbackdata
		);
}

function queryDNSDirect(server, host, recordtype, callback, authorityCallback, callbackdata) {
	DNS_Debug("DNS: Resolving " + host + " " + recordtype + " by querying " + server);
		
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
		done : false,
		finished : function(data) {
			if (!this.done)
				callback(null, callbackdata);
		},
		process : function(data){
			if (this.done) return false;
			
			this.readcount += data.length;
			
			while (this.responseHeader.length < 14 && data.length > 0) {
				this.responseHeader += data.charAt(0);
				data = data.substr(1);
			}
			if (this.responseHeader.length == 14) {
				this.msgsize = DNS_strToWord(this.responseHeader.substr(0, 2));
				this.responseBody += data;

				//DNS_Debug("DNS: Received Reply: " + (this.readcount-2) + " of " + this.msgsize + " bytes");

				if (this.readcount >= this.msgsize+2) {
					this.responseHeader = this.responseHeader.substr(2); // chop the length field
					this.done = true;
					DNS_getRDData(this.responseHeader + this.responseBody, callback, authorityCallback, callbackdata, server);
					return false;
				}
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
	var ctr = 20;
	while (ctr-- > 0) {
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

function DNS_readRec(ctx) {
	var rec = new Object();
	var ctr;
	var txtlen;
	
	rec.dom = DNS_readDomain(ctx);
	rec.type = DNS_strToWord(ctx.str.substr(ctx.idx, 2)); ctx.idx += 2;
	rec.cls = DNS_strToWord(ctx.str.substr(ctx.idx, 2)); ctx.idx += 2;
	rec.ttl = DNS_strToWord(ctx.str.substr(ctx.idx, 2)); ctx.idx += 4; // 32bit
	rec.rdlen = DNS_strToWord(ctx.str.substr(ctx.idx, 2)); ctx.idx += 2;
	
	var ctxnextidx = ctx.idx + rec.rdlen;
	
	if (rec.type == 16) {
		// TXT
		rec.rddata = "";
		ctr = 10;
		while (rec.rdlen > 0 && ctr-- > 0) {
			txtlen = DNS_strToOctet(ctx.str.substr(ctx.idx,1)); ctx.idx++; rec.rdlen--;
			rec.rddata += ctx.str.substr(ctx.idx, txtlen); ctx.idx += txtlen; rec.rdlen -= txtlen;
		}
	} else if (rec.type == 1) {
		// A: Return as a dotted-quad
		rec.rddata = ctx.str.substr(ctx.idx, rec.rdlen);
		rec.rddata = rec.rddata.charCodeAt(0) + "." + rec.rddata.charCodeAt(1) + "." + rec.rddata.charCodeAt(2) + "." + rec.rddata.charCodeAt(3);
	} else if (rec.type == 15) {
		// MX
		rec.rddata = new Object();
		rec.rddata.preference = DNS_strToWord(ctx.str.substr(ctx.idx,2)); ctx.idx += 2;
		rec.rddata.host = DNS_readDomain(ctx);
	} else {
		// NS, PTR
		rec.rddata = DNS_readDomain(ctx);
	}
	
	ctx.idx = ctxnextidx;
	
	return rec;
}

function DNS_getRDData(str, callback, authorityCallback, callbackdata, server) {
	var qcount = DNS_strToWord(str.substr(4, 2));
	var ancount = DNS_strToWord(str.substr(6, 2));
	var aucount = DNS_strToWord(str.substr(8, 2));
	var adcount = DNS_strToWord(str.substr(10, 2));
	
	var ctx = { str : str, idx : 12 };
	
	var i;
	var j;
	var dom;
	var cls;
	var ttl;
	var rec;
	
	// sanity checks
	if (qcount > 1) qcount = 1;
	if (ancount > 16) ancount = 16;
	if (aucount > 16) aucount = 16;
	
	for (i = 0; i < qcount; i++) {
		dom = DNS_readDomain(ctx);
		type = DNS_strToWord(str.substr(ctx.idx, 2)); ctx.idx += 2;
		cls = DNS_strToWord(str.substr(ctx.idx, 2)); ctx.idx += 2;
	}
	
	var results = Array(ancount);
	for (i = 0; i < ancount; i++) {
		rec = DNS_readRec(ctx);
		results[i] = rec.rddata;		
		DNS_Debug("DNS: Received Result: Result Item: " + rec.rddata);
	}

	for (i = 0; i < aucount; i++) {
		rec = DNS_readRec(ctx);
		if (results.length == 0 && DNS_ALLOW_RECURSION && rec.rddata != server) {
			DNS_Debug("DNS: Received Result: Authority: " + rec.rddata);
			authorityCallback(rec.dom, rec.rddata, callbackdata);
			return;
		}
	}
	
	for (i = 0; i < adcount; i++) {
		rec = DNS_readRec(ctx);
		DNS_Debug("DNS: Received Result: Additional: " + " (type=" + rec.type + ")" + rec.rddata);
		if (rec.type == 1) {
			for (j = 0; j < results.length; j++) {
				if (results[j].host == rec.dom) {
					if (results[j].address == null) results[j].address = Array(0);
					results[j].address[results[j].address.length] = rec.rddata;
				}
			}
		}
	}

	if (results.length > 0) {
		callback(results, callbackdata);
	} else {
		callback(null, callbackdata);
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
			//DNS_Debug("DNS: Connection closed (" + host + ")");
		},
		onDataAvailable: function(request, context, inputStream, offset, count){
			//DNS_Debug("DNS: Got data (" + host + ")");
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

function DNS_Debug(message) {
	if (false) {
		var consoleService = Components.classes["@mozilla.org/consoleservice;1"].getService(Components.interfaces.nsIConsoleService);
		consoleService.logStringMessage(message);
	}
}

function DNS_StartsWith(a, b) {
	if (b.length > a.length) return false;
	return a.substring(0, b.length) == b;
}

