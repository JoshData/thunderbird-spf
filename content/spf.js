/*
 * SENDER POLICY FRAMEWORK LIBRARY IN JAVASCRIPT
 *
 * Copyright 2005 Joshua Tauberer <tauberer@for.net>
 *
 * Feel free to use this file however you want, but
 * credit would be nice.
 */

 // http://www.ozonehouse.com/mark/spf/draft-lentczner-spf-00.txt

var SPF_GUESS = 1;

var spfRecordCache = Array(50);
var spfRecordCacheIndex = 0;

var spfConsoleService = Components.classes["@mozilla.org/consoleservice;1"].getService(Components.interfaces.nsIConsoleService);

//SPF("68.167.112.147", "for.net", function(result) { alert(result.message); });
//SPF("130.94.251.12", "craigslist.org", function(result) { alert(result.message); });
//SPF("64.4.240.67", "paypal.com", function(result) { alert(result.message); });

function SPF(ip, domain, callback) {
	SPF_Debug("Begin SPF Test on " + ip + " for " + domain);
	// none, neutral, pass, fail, softfail, temperror, permerror
	SPF_GetRecord(
		domain,
		function(record) {
			if (record == null) {
				callback(new SPFResult("0", "Domain does not support SPF verification.", 0));
				return;
			}
			
			// Do a reverse DNS if the SPF record might need it.
			// It would be better to do a reverse DNS only when
			// we get to that point in the processing, but then
			// we're not in a position to do the lookup async.
			if (record.usesPTR) {
				reverseDNS(ip, function(data) { if (data == null) data = Array(0); SPF_DoCheck(record, ip, domain, data, callback, 0); });
				return;
			}
			
			SPF_DoCheck(record, ip, domain, null, callback, 0);
		});
}

function SPF_DoCheck(record, ip, domain, reversedns, callback, hops) {
	if (hops == 5) { callback(new SPFResult("permerror", "The maximum number of SPF redirects was reached.", 0)); return; }
	
	var result = SPF_DoCheck2(record, ip, domain, reversedns);
	if (result != null) {
		var message;
		if (result == "+") message = "The sender was " + (!record.isguess ? "explicitly" : "implicitly") + " permitted by <" + domain + ">.";
		else if (result == "-") message = "The sender was denied by <" + domain + ">.";
		else if (result == "~") message = "The sender was not permitted by <" + domain + ">.";
		else if (result == "?") message = "The sender could not be verified by <" + domain + ">.";
		else if (result == "permerror") message = "The sender has a SPF configuration problem or uses an unsupported feature.";
		else if (result == "temperror") message = "There was a temporary problem using SPF verification.";
		
		callback(new SPFResult(result, message, record.isguess));
		return;
	}
	
	if (record.isguess) {
		callback(new SPFResult("0", "Domain <" + domain + "> does not support SPF verification.", 0));
		return;
	}
	
	if (record["redirect"] != null) {
		SPF(ip, SPF_ExpandDomainSpec(record["redirect"]), callback);
		return;
	}		
	
	// Processing fell through to the end.
	callback(new SPFResult("?", "The sender could not be verified by <" + domain + ">.", false));
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

function SPF_GetRecord(domain, callback) {
	for (var i = 0; i < spfRecordCache.length; i++) {
		if (spfRecordCache[i] == null) break;
		if (spfRecordCache[i].domain == domain) {
			SPF_Debug(" Cached Entry Found");
			callback(spfRecordCache[i].record);
			return;
		}
	}
	
	queryDNS(domain, "TXT",
		function(txtrecords) {
			if (txtrecords != null) {
				var i;
				for (i = 0; i < txtrecords.length; i++) {
					if (txtrecords[i] == "v=spf1" || SPF_StartsWith(txtrecords[i], "v=spf1 ")) {
						txtrecords[i] = txtrecords[i].substr(6); // chop off v=spf1	
						ParseSPFRecord(txtrecords[i], domain, callback, false);
						return;
					}
				}
			}
			if (SPF_GUESS) {
				SPF_Debug(" Using Guess Mechanisms");
				ParseSPFRecord("a/24 mx/24", domain, callback, true);
			} else {
				SPF_Debug(" No 'v=spf1' TXT Record Found");
				callback(null);
			}
		} );
	
}

function ParseSPFRecord(record, domain, callback, isguess) {
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
			mech.startResolving(doneFunc);
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
			mech.startResolving = function(callbackWhenAllDone) {
				SPF_GetRecord(
					target,
					function(record) {
						mech.include = record;
						if (record.usesPTR) recobj.usesPTR = true;
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
			mech.startResolving = function(callbackWhenAllDone) {
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

