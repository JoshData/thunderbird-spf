/*
 * SENDER POLICY FRAMEWORK LIBRARY IN JAVASCRIPT
 *
 * Copyright 2005 Joshua Tauberer <http://razor.occams.info>
 *
 * Feel free to use this file however you want, but
 * credit would be nice.
 */

 // http://www.ozonehouse.com/mark/spf/draft-lentczner-spf-00.txt

var SPF_GUESS = 1;

var spfRecordCache = Array(50);
var spfRecordCacheIndex = 0;

var spfConsoleService = Components.classes["@mozilla.org/consoleservice;1"].getService(Components.interfaces.nsIConsoleService);

//SPF("68.167.112.147", "occams.info", function(result) { alert(result.message); });
//SPF("130.94.251.12", "craigslist.org", function(result) { alert(result.message); });
//SPF("64.4.240.67", "paypal.com", function(result) { alert(result.message); });

function SPF(ip, domain, callback) {
	var dnsLimit = new Object();
	dnsLimit.counter = 0;
	dnsLimit.check = function() {
			if (this.exceeded()) {
				SPF_Debug("SPF check exceeded maximum number of DNS queries allowed, checking " + ip + " for " + domain);
				return false;
			}
			this.counter++;
			return true;
		};
	dnsLimit.exceeded = function() {
		// The spec says 10.  We do 11 to include the first DNS query to get the record itself.
		return this.counter == 11;
	};
	
	SPF2(ip, domain, callback, dnsLimit);
}

function SPF2(ip, domain, callback, dnsLimit) {
	SPF_Debug("Begin SPF Test on " + ip + " for " + domain);
	
	// none, neutral, pass, fail, softfail, temperror, permerror
	SPF_GetRecord(
		domain,
		dnsLimit,
		function(record, queryError) {
			if (record == null) {
				if (queryError == null)
					callback(new SPFResult("0", SPF_STRINGS.NOT_SUPPORTED(domain), 0));
				else
					callback(new SPFResult("E", SPF_STRINGS.ERROR(queryError), 0));
				return;
			}
			
			// Do a reverse DNS if the SPF record might need it.
			// It would be better to do a reverse DNS only when
			// we get to that point in the processing, but then
			// we're not in a position to do the lookup async.
			if (record.usesPTR && dnsLimit.check()) {
				reverseDNS(ip, function(data) { if (data == null) data = Array(0); SPF_DoCheck(record, ip, domain, data, callback, dnsLimit); });
				return;
			}
			
			SPF_DoCheck(record, ip, domain, null, callback, dnsLimit);
		});
}

function SPF_DoCheck(record, ip, domain, reversedns, callback, dnsLimit) {
	if (dnsLimit.exceeded()) {
		callback(new SPFResult("permerror", SPF_STRINGS.DNS_EXCEEDED, 0));
		return;
	}
	
	var result = SPF_DoCheck2(record, ip, domain, reversedns);
	
	if (result != null) {
		var message;
		if (result == "+") message = SPF_STRINGS.PASS(domain, record.isguess);
		else if (result == "-") message = SPF_STRINGS.FAIL(domain);
		else if (result == "~") message = SPF_STRINGS.SOFTFAIL(domain);
		else if (result == "?") message = SPF_STRINGS.UNKNOWN(domain);
		else if (result == "permerror") message = SPF_STRINGS.PERMERROR;
		else if (result == "temperror") message = SPF_STRINGS.TEMPERROR;
		
		callback(new SPFResult(result, message, record.isguess));
		return;
	}
	
	if (record.isguess) {
		callback(new SPFResult("0", SPF_STRINGS.NOT_SUPPORTED(domain), 0));
		return;
	}
	
	if (record["redirect"] != null) {
		SPF2(ip, SPF_ExpandDomainSpec(record["redirect"]), callback, dnsLimit);
		return;
	}		
	
	// Processing fell through to the end.
	callback(new SPFResult("?", SPF_STRINGS.UNKNOWN(domain), false));
}

function SPF_DoCheck2(record, ip, domain, reversedns) {
	var mech = record.firstMechanism;
	var test;
	while (mech != null) {
		try {
			test = mech.matchTest(ip, domain, reversedns, mech);
		} catch (e) {
			SPF_Debug(e);
			return "permerror";
		}
		SPF_Debug(" Mechanism " + mech.prefix + mech.name + " => " + test);
		if (test)
			return mech.prefix;		
		mech = mech.nextMechanism;
	}
	return null;
}

function SPF_GetRecord(domain, dnsLimit, callback) {
	for (var i = 0; i < spfRecordCache.length; i++) {
		if (spfRecordCache[i] == null) break;
		if (spfRecordCache[i].domain == domain) {
			SPF_Debug(" Cached Entry Found");
			callback(spfRecordCache[i].record);
			return;
		}
	}
	
	if (!dnsLimit.check()) {
		callback(null, SPF_STRINGS.DNS_EXCEEDED);
		return;
	}
		
	queryDNS(domain, "TXT",
		function(txtrecords, mydata, queryError) {
			if (txtrecords != null) {
				var i;
				for (i = 0; i < txtrecords.length; i++) {
					if (txtrecords[i] == "v=spf1" || SPF_StartsWith(txtrecords[i], "v=spf1 ")) {
						txtrecords[i] = txtrecords[i].substr(6); // chop off v=spf1
						SPF_Debug(" Found: " + txtrecords[i]);
						ParseSPFRecord(txtrecords[i], domain, callback, false, dnsLimit);
						return;
					}
				}
			}
			
			if (queryError != null) {
				callback(null, queryError);
			} else if (SPF_GUESS) {
				SPF_Debug(" Using Guess Mechanisms");
				ParseSPFRecord("a/24 mx/24", domain, callback, true, dnsLimit);
			} else {
				SPF_Debug(" No 'v=spf1' TXT Record Found");
				callback(null);
			}
		} );
	
}

function ParseSPFRecord(record, domain, callback, isguess, dnsLimit) {
	var recobj = new SPFRecord();
	recobj.isguess = isguess;
	
	// Process each term
	while (record != "") {
		for (var i = 0; i < record.length; i++) {
			if (record.charAt(i) == " " || i == record.length-1) {
				if (record.charAt(i) != " " && i == record.length-1)
					i++;
				ProcessTerm(record.substring(0, i), recobj, domain);
				record = record.substr(i+1);
				break;
			} 
		}
	}
	
	if (recobj.needsResolving == 0)
		callback(recobj);
	
	var doneFunc = function() { callback(recobj); };
	
	// Start resolving the things that need extra resolving.
	var mech = recobj.firstMechanism;
	while (mech != null) {
		if (mech.startResolving != null)
			mech.startResolving(dnsLimit, doneFunc);
		mech = mech.nextMechanism;
	}
	
	spfRecordCache[spfRecordCacheIndex] = new Object();
	spfRecordCache[spfRecordCacheIndex].domain = domain;
	spfRecordCache[spfRecordCacheIndex].record = recobj;
	spfRecordCacheIndex++
}

function ProcessTerm(term, recobj, domain) {
	if (term == "" || term == " ") return;
	
	var prefix = "+";
	if (term.charAt(0) == "+" || term.charAt(0) == "-" || term.charAt(0) == "?" || term.charAt(0) == "~") {
		prefix = term.charAt(0);
		term = term.substr(1);
	}
	
	var eq = term.indexOf("=");
	if (eq == -1) {
		var mech = null;
		var domcidr;
		var domain2;
		
		// Mechanism
		if (term == "all") {
			mech = new SPFMechanism(prefix, term,
				function(ip, domain, reversedns, mech) { return true; } );
		
		} else if (SPF_StartsWith(term, "include:")) {
			var target = SPF_ExpandDomainSpec(term.substr(8));
			mech = new SPFMechanism(prefix, term, 
				function(ip, domain, reversedns, mech) {
					var incresult = SPF_DoCheck2(mech.include, ip, domain, reversedns);
					return (incresult == "+");
				});
			mech.startResolving = function(dnsLimit, callbackWhenAllDone) {
				SPF_GetRecord(
					target,
					dnsLimit,
					function(record) {
						if (record != null) {
							mech.include = record;
							if (record.usesPTR) recobj.usesPTR = true;
						}
						if (--recobj.needsResolving == 0) callbackWhenAllDone();
					});
			};
			recobj.needsResolving++;
		
		} else if (
			(term == "a" || SPF_StartsWith(term, "a:") || SPF_StartsWith(term, "a/"))
			|| (term == "mx" || SPF_StartsWith(term, "mx:") || SPF_StartsWith(term, "mx/")) ) {
			
			domcidr = SPF_ParseDomainCidr(term, domain);
			domcidr.addrType = domcidr.mechanism.toUpperCase();
			mech = new SPFMechanism(prefix, term,
				function(ip, domain, reversedns, mech) {
					for (var i = 0; i < mech.addresses.length; i++) {
						if (mech.addresses[i] == null) {
							// ??
						} else if (typeof(mech.addresses[i]) == "string") {
							SPF_Debug(" Comparing " + ip + " and " + mech.addresses[i] + " with CIDR4=" + domcidr.cidr4);
							if (SPF_TestIP(ip, mech.addresses[i], domcidr.cidr4))
								return true;
						} else {
							for (var j = 0; j < mech.addresses[i].length; j++) {
								SPF_Debug(" Comparing " + ip + " and " + mech.addresses[i][j] + " with CIDR4=" + domcidr.cidr4);
								if (SPF_TestIP(ip, mech.addresses[i][j], domcidr.cidr4))
									return true;
							}
						}
					}
					return false;
				} );
			mech.startResolving = function(dnsLimit, callbackWhenAllDone) {
				if (!dnsLimit.check()) {
					if (--recobj.needsResolving == 0) callbackWhenAllDone();
					return;
				}
				
				queryDNS(domcidr.domain, domcidr.addrType,
					function(dnsrecords) {
						if (dnsrecords == null) { dnsrecords = Array(0); }
						mech.addresses = Array(0);
						for (var i = 0; i < dnsrecords.length; i++) {
							if (dnsrecords[i].address != null) {
								for (var j = 0; j < dnsrecords[i].address.length; j++)
									mech.addresses[mech.addresses.length] = dnsrecords[i].address[j];
							} else if (dnsrecords[i].host != null) {
								recobj.needsResolving++;
								SPF_Debug(" Resolving Host for '" + term + "': " + dnsrecords[i].host);
								domain2 = dnsrecords[i].host;
								
								if (!dnsLimit.check()) {
									if (--recobj.needsResolving == 0) callbackWhenAllDone();
									return;
								}
								queryDNS(domain2, "A",
									function(dnsrecords2) {
										SPF_Debug(" Resolved Host for '" + term + "': " + domain2);
										if (dnsrecords2 == null) { dnsrecords2 = Array(0); }
										mech.addresses[i] = Array(dnsrecords2.length);
										for (var j = 0; j < dnsrecords2.length; j++) {
											SPF_Debug(" Resolved Address for '" + domain2 + "': " + dnsrecords2[j]);
											mech.addresses[i][j] = dnsrecords2[j];
										}
										if (--recobj.needsResolving == 0) callbackWhenAllDone();
									});
							} else {
								SPF_Debug(" Resolved Address for '" + term + "': " + dnsrecords[i]);
								mech.addresses[mech.addresses.length] = dnsrecords[i];
							}
						}
						if (--recobj.needsResolving == 0) callbackWhenAllDone();
					});
			};
			recobj.needsResolving++;
			
		} else if (SPF_StartsWith(term, "ip4:")) {
			domcidr = SPF_ParseDomainCidr(term, null);
			domcidr.address = domcidr.domain;
			
			mech = new SPFMechanism(prefix, term,
				function(ip, domain, reversedns, mech) {
					SPF_Debug(" Comparing " + ip + " and " + domcidr.address + " with CIDR4=" + domcidr.cidr4);
					return SPF_TestIP(ip, domcidr.address, domcidr.cidr4);
				} );
				
		/*} else if (SPF_StartsWith(term, "exists:")) {
			domcidr = SPF_ParseDomainCidr(term, null);
			
			mech = new SPFMechanism(prefix, term,
				function(ip, domain, reversedns, mech) {
					return mech.exists;
				} );
			mech.startResolving = function(callbackWhenAllDone) {
				queryDNS(domain, "A",
					function(dnsrecords) {
						mech.exists = (dnsrecords != null);
						if (--recobj.needsResolving == 0) callbackWhenAllDone();
					});
			};
			recobj.needsResolving++;*/
				
		} else if (term == "ptr" || SPF_StartsWith(term, "ptr:")) {
			domcidr = SPF_ParseDomainCidr(term, domain);
			
			mech = new SPFMechanism(prefix, term,
				function(ip, domain, reversedns, mech) {
					for (var j = 0; j < reversedns.length; j++) {
						SPF_Debug(" Comparing " + reversedns[j] + " to " + domcidr.domain);
						if (reversedns[j] == domcidr.domain || endsWith(reversedns[j], "." + domcidr.domain))
							return true;
					}
					return false;
				} );
				
			recobj.usesPTR = true;
			
		} else {
			// When an unrecognized mechanism is hit, always return ?-status.
			mech = new SPFMechanism(prefix, term,
				function(ip, domain, mech) {
					SPF_Debug("The SPF mechanism <" + term + "> is not supported.");
					return true;
				} );
			mech.prefix = "?";
		}
		
		if (recobj.lastMechanism == null) {
			recobj.firstMechanism = mech;
			recobj.lastMechanism = mech;
		} else {
			recobj.lastMechanism.nextMechanism = mech;
			recobj.lastMechanism = mech;
		}
	} else {
		// Modifier: Store as a property of the record object.
		recobj[term.substr(0, eq)] = term.substr(eq+1);
	}
}

function SPF_DottedQuadToInt(ip) {
	var q = ip.split(".");  // The "1*" forces the first term to be numeric
	return (1*q[3]) + (q[2] << 8) + (q[1] << 16) + (q[0] << 24);
}

function SPF_IntToBin(x) {
	var i;
	var b = "";
	for (i = 0; i <= 7; i++) {
		if ((x & (1<<i)) != 0)
			b = "1" + b;
		else
			b = "0" + b;
	}
	return b;
}

function SPF_DottedQuadToBinary(ip) {
	var q = ip.split(".");
	return SPF_IntToBin(q[0]) + SPF_IntToBin(q[1]) + SPF_IntToBin(q[2]) + SPF_IntToBin(q[3]);
}

function SPF_TestIP(ip1, ip2, cidr) {
	return (SPF_DottedQuadToInt(ip1) >> (32-cidr)) == (SPF_DottedQuadToInt(ip2) >> (32-cidr));
}

function SPF_ParseDomainCidr(target, domain) {
	var ret = new Object();
	ret.domain = domain;
	ret.cidr4 = 32;
	ret.cidr6 = 32*4;
	
	if (target.indexOf("/") != -1) {
		var cidr = target.substr(target.indexOf("/")+1);
		target = target.substr(0, target.indexOf("/"));
		
		if (cidr.indexOf("/") == -1) {
			ret.cidr4 = cidr;
		} else if (cidr.indexOf("/") == 0) {
			ret.cidr6 = cidr.substr(1);
		} else {
			ret.cidr4 = cidr.substr(0, cidr.indexOf("/"));
			ret.cidr6 = cidr.substr(cidr.indexOf("/")+1);
		}
	}
	
	if (target.indexOf(":") != -1) {
		ret.domain = SPF_ExpandDomainSpec( target.substr(target.indexOf(":")+1) );
		target = target.substr(0, target.indexOf(":"));
	}
	
	ret.mechanism = target;
	
	return ret;
}

function SPF_ExpandDomainSpec(domainspec) {
	return domainspec;
}

function SPFRecord(domain) {
	this.domain = domain;
	this.firstMechanism = null; // linked list of mechanisms
	this.lastMechanism = null; // last mechanism in list
	this.needsResolving = 0;
}

function SPFMechanism(prefix, name, matchTest) {
	this.prefix = prefix;
	this.name = name;
	this.matchTest = matchTest;
	this.nextMechanism = null;
}

function SPFResult(status, message, isguess) {
	this.status = status;
	this.message = message;
	this.isguess = isguess;
}

function SPF_Debug(message) {
	if (false) {
		spfConsoleService.logStringMessage(message);
	}
}

function SPF_StartsWith(a, b) {
	if (b.length > a.length) return false;
	return a.substring(0, b.length) == b;
}

