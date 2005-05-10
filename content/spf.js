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

var SPF_TESTS = [
	["192.0.2.1", "01.spf1-test.mailzone.com","neutral"],
	["192.0.2.1", "02.spf1-test.mailzone.com","fail"],
	["192.0.2.1", "03.spf1-test.mailzone.com","softfail"],
	["192.0.2.1", "06.spf1-test.mailzone.com", "neutral"],
	["192.0.2.1", "07.spf1-test.mailzone.com", "none"],
	["192.0.2.1", "08.spf1-test.mailzone.com", "fail"],
	["192.0.2.1", "10.spf1-test.mailzone.com", "fail"],
	["192.0.2.10", "10.spf1-test.mailzone.com", "pass"],
	["192.0.2.11", "10.spf1-test.mailzone.com", "pass"],
	["192.0.2.12", "10.spf1-test.mailzone.com", "pass"],
	["192.0.2.13", "10.spf1-test.mailzone.com", "pass"],
	["192.0.2.20", "10.spf1-test.mailzone.com", "pass"],
	["192.0.2.21", "10.spf1-test.mailzone.com", "pass"],
	["192.0.2.22", "10.spf1-test.mailzone.com", "pass"],
	["192.0.2.23", "10.spf1-test.mailzone.com", "pass"],
	["192.0.2.30", "10.spf1-test.mailzone.com", "pass"],
	["192.0.2.31", "10.spf1-test.mailzone.com", "pass"],
	["192.0.2.32", "10.spf1-test.mailzone.com", "pass"],
	["192.0.2.33", "10.spf1-test.mailzone.com", "pass"],
	["192.0.2.34", "10.spf1-test.mailzone.com", "fail"],
	["192.0.2.1", "11.spf1-test.mailzone.com", "fail"],
	["192.0.2.10", "11.spf1-test.mailzone.com", "pass"],
	["192.0.2.33", "11.spf1-test.mailzone.com", "pass"],
	["192.0.2.1", "12.spf1-test.mailzone.com", "fail"],
	["192.0.2.10", "12.spf1-test.mailzone.com", "pass"],
	["192.0.2.33", "12.spf1-test.mailzone.com", "pass"],
	["208.210.124.192", "12.spf1-test.mailzone.com", "fail"],
	["192.0.2.1", "13.spf1-test.mailzone.com", "fail"],
	["192.0.2.10", "13.spf1-test.mailzone.com", "pass"],
	["192.0.2.33", "13.spf1-test.mailzone.com", "pass"],
	["208.210.124.192", "13.spf1-test.mailzone.com", "fail"],
	["192.0.2.40", "13.spf1-test.mailzone.com", "pass"],
	["192.0.2.1", "14.spf1-test.mailzone.com", "fail"],
	["192.0.2.10", "14.spf1-test.mailzone.com", "pass"],
	["192.0.2.33", "14.spf1-test.mailzone.com", "pass"],
	["208.210.124.192", "14.spf1-test.mailzone.com", "fail"],
	["192.0.2.40", "14.spf1-test.mailzone.com", "pass"],
	["192.0.2.1", "20.spf1-test.mailzone.com", "fail"],
	["192.0.2.120", "20.spf1-test.mailzone.com", "pass"],
	["192.0.2.1", "21.spf1-test.mailzone.com", "fail"],
	["192.0.2.121", "21.spf1-test.mailzone.com", "fail"],
	["192.0.2.200", "21.spf1-test.mailzone.com", "pass"],
	["192.0.2.1", "22.spf1-test.mailzone.com", "fail"],
	["192.0.2.122", "22.spf1-test.mailzone.com", "pass"],
	["192.0.2.200", "22.spf1-test.mailzone.com", "pass"],
	["64.236.24.4", "30.spf1-test.mailzone.com", "fail"],
	["208.210.124.130", "30.spf1-test.mailzone.com", "pass"],
	["64.236.24.4", "31.spf1-test.mailzone.com", "fail"],
	["208.210.124.130", "31.spf1-test.mailzone.com", "pass"],
	["208.210.124.192", "31.spf1-test.mailzone.com", "pass"],
	["64.236.24.4", "32.spf1-test.mailzone.com", "fail"],
	["208.210.124.130", "32.spf1-test.mailzone.com", "pass"],
	["208.210.124.131", "32.spf1-test.mailzone.com", "pass"],
	["208.210.124.192", "32.spf1-test.mailzone.com", "pass"],
	["192.0.2.100", "40.spf1-test.mailzone.com", "pass"],
	["192.0.2.101", "40.spf1-test.mailzone.com", "pass"],
	["192.0.2.102", "40.spf1-test.mailzone.com", "fail"],
	["192.0.2.100", "41.spf1-test.mailzone.com", "fail"],
	["192.0.2.110", "41.spf1-test.mailzone.com", "pass"],
	["192.0.2.111", "41.spf1-test.mailzone.com", "pass"],
	["192.0.2.100", "42.spf1-test.mailzone.com", "fail"],
	["192.0.2.110", "42.spf1-test.mailzone.com", "pass"],
	["192.0.2.130", "42.spf1-test.mailzone.com", "pass"],
	["192.0.2.131", "42.spf1-test.mailzone.com", "pass"],
	["192.0.2.140", "45.spf1-test.mailzone.com", "fail"],
	["192.0.2.145", "45.spf1-test.mailzone.com", "fail"],
	["192.0.2.146", "45.spf1-test.mailzone.com", "fail"],
	["192.0.2.147", "45.spf1-test.mailzone.com", "fail"],
	["192.0.2.148", "45.spf1-test.mailzone.com", "fail"],
	["208.210.124.192", "45.spf1-test.mailzone.com", "pass"],
	["192.0.2.200", "45.spf1-test.mailzone.com", "pass"],
	["192.0.2.200", "50.spf1-test.mailzone.com", "unknown"],
	["192.0.2.200", "51.spf1-test.mailzone.com", "fail"],
	["192.0.2.130", "51.spf1-test.mailzone.com", "pass"],
	["192.0.2.200", "52.spf1-test.mailzone.com", "fail"],
	["192.0.2.130", "52.spf1-test.mailzone.com", "pass"],
	["192.0.2.200", "55.spf1-test.mailzone.com", "unknown"],
	["192.0.2.130", "55.spf1-test.mailzone.com", "unknown"],
	["192.0.2.200", "56.spf1-test.mailzone.com", "none"],
	["192.0.2.200", "57.spf1-test.mailzone.com", "unknown"],
	["192.0.2.130", "57.spf1-test.mailzone.com", "unknown"],
	["192.0.2.200", "58.spf1-test.mailzone.com", "unknown"],
	["192.0.2.130", "59.spf1-test.mailzone.com", "unknown"],
	["192.0.2.103", "droid@70.spf1-test.mailzone.com", "fail"],
	["192.0.2.103", "bob+1@70.spf1-test.mailzone.com", "pass"],
	["192.0.2.103", "bob+2@70.spf1-test.mailzone.com", "pass"],
	["192.0.2.103", "bob@70.spf1-test.mailzone.com", "pass"],
	["192.0.2.103", "joe+1@70.spf1-test.mailzone.com", "fail"],
	["192.0.2.103", "joe-2@70.spf1-test.mailzone.com", "fail"],
	["192.0.2.103", "moe-1@70.spf1-test.mailzone.com", "fail"],
	["192.0.2.103", "70.spf1-test.mailzone.com", "pass"],
	["64.236.24.4", "80.spf1-test.mailzone.com", "fail"],
	["208.210.124.180", "80.spf1-test.mailzone.com", "pass"],
	["192.0.2.80", "80.spf1-test.mailzone.com", "pass"],
	["192.0.2.1", "90.spf1-test.mailzone.com", "fail"],
	["192.0.2.127", "90.spf1-test.mailzone.com", "fail"],
	["192.0.2.129", "90.spf1-test.mailzone.com", "pass"],
	["192.168.1.1", "91.spf1-test.mailzone.com", "fail"],
	["192.0.2.127", "91.spf1-test.mailzone.com", "pass"],
	["192.0.2.129", "91.spf1-test.mailzone.com", "fail"],
	["192.168.2.1", "92.spf1-test.mailzone.com", "fail"],
	["192.0.2.1", "92.spf1-test.mailzone.com", "fail"],
	["192.0.2.129", "92.spf1-test.mailzone.com", "pass"],
	["192.0.2.193", "92.spf1-test.mailzone.com", "neutral"],
	["208.210.124.180", "95.spf1-test.mailzone.com", "pass"],
	["208.210.124.1", "95.spf1-test.mailzone.com", "fail"],
	["192.0.2.193", "96.spf1-test.mailzone.com", "fail"],
	["208.210.124.180", "97.spf1-test.mailzone.com", "pass"],
	["192.0.2.1", "98.spf1-test.mailzone.com", "fail"],
	["192.0.2.98", "98.spf1-test.mailzone.com", "pass"],
	["192.0.2.99", "98.spf1-test.mailzone.com", "pass"],
	["208.210.124.180", "98.spf1-test.mailzone.com", "pass"],
	["208.210.124.1", "98.spf1-test.mailzone.com", "fail"],
	["208.210.124.181", "98.spf1-test.mailzone.com", "pass"],
	["192.0.2.1", "08.spf1-test.mailzone.com", "fail"],
	["192.0.2.1", "09.spf1-test.mailzone.com", "fail"],
	["192.0.2.1", "99.spf1-test.mailzone.com", "fail"],
	["192.0.2.1", "100.spf1-test.mailzone.com", "fail"],
	["192.0.2.98", "100.spf1-test.mailzone.com", "pass"],
	["192.0.2.98", "101.spf1-test.mailzone.com", "fail"],
	["192.0.2.98", "102.spf1-test.mailzone.com", "neutral"],
	["192.0.2.98", "103.spf1-test.mailzone.com", "pass"],
	["192.0.2.98", "droid@104.spf1-test.mailzone.com", "unknown"],
	["192.0.2.33", "20.spf1-test.mailzone.com", "fail"],
	["192.0.2.33", "20.spf1-test.mailzone.com", "pass"],
	["192.0.2.33", "20.spf1-test.mailzone.com", "fail"],
	["192.0.2.34", "20.spf1-test.mailzone.com", "fail"],
	["192.0.2.120", "20.spf1-test.mailzone.com", "pass"],
	["192.0.2.120", "20.spf1-test.mailzone.com", "pass"],
	["192.0.2.33", "20.spf1-test.mailzone.com", "fail"],
	["192.0.2.33", "20.spf1-test.mailzone.com", "fail"],
	["192.0.2.98", "103.spf1-test.mailzone.com", "pass"],
	["192.0.2.1", "20.spf1-test.mailzone.com", "pass"],
	["192.0.2.1", "20.spf1-test.mailzone.com", "pass"],
	["192.0.2.1", "20.spf1-test.mailzone.com", "fail"],
	["192.168.1.1", "91.spf1-test.mailzone.com", "pass"],
	["192.0.2.127", "91.spf1-test.mailzone.com", "pass"],
	["192.0.2.129", "91.spf1-test.mailzone.com", "fail"],
	["192.168.2.1", "92.spf1-test.mailzone.com", "pass"],
	["192.0.2.1", "92.spf1-test.mailzone.com", "pass"],
	["192.0.2.129", "92.spf1-test.mailzone.com", "pass"],
	["192.0.2.193", "92.spf1-test.mailzone.com", "neutral"],
	["192.0.2.1", "100.spf1-test.mailzone.com", "pass"],
	["192.0.2.98", "100.spf1-test.mailzone.com", "pass"],
	["192.0.2.98", "101.spf1-test.mailzone.com", "fail"],
	["192.0.2.98", "102.spf1-test.mailzone.com", "neutral"],
	["192.0.2.200", "10.spf1-test.mailzone.com", "fail"],
	["192.0.2.200", "10.spf1-test.mailzone.com", "pass"],
	["192.0.2.110", "10.spf1-test.mailzone.com", "pass"],
	["192.0.2.110", "42-27@10.spf1-test.mailzone.com", "pass"],
	["192.0.2.110", "42-27@10.spf1-test.mailzone.com", "unknown"],
	["192.0.2.110", "42-27@10.spf1-test.mailzone.com", "unknown"],
	["192.0.2.110", "42di27@10.spf1-test.mailzone.com", "unknown"],
	["192.0.2.110", "42:27@10.spf1-test.mailzone.com", "unknown"],
	["192.0.2.110", "42:27@10.spf1-test.mailzone.com", "unknown"],
	["192.0.2.110", "4227@10.spf1-test.mailzone.com", "unknown"],
	["192.0.2.110", "42-27@10.spf1-test.mailzone.com", "unknown"],
	["192.0.2.110", "42327@10.spf1-test.mailzone.com", "unknown"],
	["192.0.2.110", "10.spf1-test.mailzone.com", "pass"],
	["192.0.2.200", "10.spf1-test.mailzone.com", "error"],
	["192.0.2.200", "10.spf1-test.mailzone.com", "softfail"],
	["192.0.2.10", "111.spf1-test.mailzone.com", "pass"],
	["192.0.2.200", "111.spf1-test.mailzone.com", "fail"],
	["1.2.3.4", "111.spf1-test.mailzone.com", "unknown"],
	["192.0.2.200", "112.spf1-test.mailzone.com", "unknown"],
	["1.2.3.4", "112.spf1-test.mailzone.com", "unknown"],
	["192.0.2.200", "113.spf1-test.mailzone.com", "unknown"],
	["1.2.3.4", "113.spf1-test.mailzone.com", "unknown"],
	["192.0.2.10", "114.spf1-test.mailzone.com", "pass"],
	["192.0.2.200", "114.spf1-test.mailzone.com", "fail"],
	["1.2.3.4", "114.spf1-test.mailzone.com", "softfail"],
	["192.0.2.200", "115.spf1-test.mailzone.com", "unknown"],
	["1.2.3.4", "115.spf1-test.mailzone.com", "unknown"],
	["192.0.2.200", "116.spf1-test.mailzone.com", "pass"],
	["1.2.3.4", "116.spf1-test.mailzone.com", "fail"],
	["192.0.2.200", "117.spf1-test.mailzone.com", "none"],
	["192.0.2.200", "118.spf1-test.mailzone.com", "fail"] ];

//SPF_RunTest(0);
	
function SPF_RunTest(test) {
	if (test == 0) {
		SPF_Debug("Begin SPF Tests...");
	} else if (test == SPF_TESTS.length) {
		SPF_Debug("Done running tests.");
		return;
	}
	
	var ip = SPF_TESTS[test][0];
	var domain = SPF_TESTS[test][1];
	var expected = SPF_TESTS[test][2];
	SPF(ip, domain, function(result) {
		result = result.status;
		if ((expected == "pass" && result != "+") || (expected == "fail" && result != "-") || (expected == "unknown" && result != "0") || (expected == "softfail" && result != "~") || (expected == "neutral" && result != "?")) {
			spfConsoleService.logStringMessage("Test " + test + " Failed: IP=" + ip + " DOMAIN=" + domain + " EXPECTED=" + expected + " RESULT=" + result);
		} else {
			spfConsoleService.logStringMessage("Test " + test + " Passed");
		}
		window.setTimeout("SPF_RunTest(" + (test+1) + ");", 1000);
	});
}

//SPF("68.167.112.147", "for.net", function(result) { alert(result); });

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
		else if (result == "-") message = "The sender was denied by <" + domain + ">.  Address domain could be forged.";
		else if (result == "~") message = "The sender was not permitted by <" + domain + ">.  Address domain could be forged.";
		else if (result == "?") message = "The sender could not be verified by <" + domain + ">.  Address domain could be forged.";
		else if (result == "permerror") message = "The sender has a SPF configuration problem.";
		else if (result == "temperror") message = "There was a temporary problem using SPF verification.";
		
		callback(new SPFResult(result, message, record.isguess));
		return;
	}
	
	if (record.isguess) {
		callback(new SPFResult("0", "Domain does not support SPF verification.", 0));
		return;
	}
	
	if (record["redirect"] != null) {
		SPF(ip, SPF_ExpandDomainSpec(record["redirect"]), callback);
		return;
	}		
	
	// Processing fell through to the end.
	callback(new SPFResult("?", "The sender could not be verified by <" + domain + ">.  Address domain could be forged.", false));
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

