/*
 * MOZILLA THUNDERBIRD EXTENSION FOR SENDER POLICY FRAMEWORK QUERYING
 *
 * Copyright 2004 Joshua Tauberer <tauberer@for.net>
 *
 * Feel free to use and copy and modify this file however you like.
 */

// CONSTANTS

var useragent = "spf:0.2"; // The useragent field sent to the query server

// REGULAR EXPRESSIONS

var ReturnPathRegEx = /^Return-Path: <([^>]+)>/;
var ReceivedRegEx = /^Received: from ([\w\W]+) \([\w\W]*\[([\d\.]+)\]/; // The sendmail-style Received: header.
var ReceivedRegEx2 = /^Received: from \[([\d\.]+)\] \(helo=([^)]+)\)/; // An apparently Exim-style header: Received: from [65.54.185.19] (helo=hotmail.com)
var ReceivedRegEx3 = /^Received: from ([\w\W]+) \(([\d\.]+)\)/; // Yet another format
var FromRegEx = /^From: [^<]*<([^>]+)>|^From: ([\w\d\._-]+@[\w\d\._-]+)/;	
var DateRegEx = /^Date: ([\w\W]+)/;

// MISC

var xmlhttp = new XMLHttpRequest();

var DAYS_TOO_OLD = 7; // THIS MANY DAYS IN THE PAST => NO SPF CHECK
var DAYS_IN_THE_FUTURE = 1.1; // THIS MANY DAYS IN THE FUTURE => NO SPF CHECK

// PREFERENCES

var prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch);

var serverurl = "";
var checkonload = "";
var usedk = "";

// GLOBAL VARIABLES
// Yes it's a bad way to program, but it seems necessary in order
// to put some code in the xmlhttp callbacks.

var FromHdr = null;
var EnvFrom = null;
var DateHdr = null;

var HeloName = null;
var IPAddr = null;

var HeloName2 = null;
var IPAddr2 = null;

var DKHash = null;

var ret = null;
var retFrom = null;
var retEnv = null;

var spfBox;
var statusText;
var spfLinkDiv;
var statusLink;
var statusTrust;

// Whenever the messagepane loads, run a SPF check.
var messagepane = document.getElementById("messagepane");
messagepane.addEventListener("load", spfGoEvent, true);

function spfLoadSettings() {
	serverurl = "";
	if (prefs.getPrefType("spf.queryserver") == prefs.PREF_STRING) {
		serverurl = prefs.getCharPref("spf.queryserver");
	}
	
	// Set the default query server.
	if (!serverurl) {
		serverurl = "http://taubz.for.net/code/spf/cgi-bin/query.cgi";
		prefs.setCharPref("spf.queryserver", serverurl);
	}
	
	// Check on mail load?
	checkonload = "";
	if (prefs.getPrefType("spf.checkonload") == prefs.PREF_STRING) {
		checkonload = prefs.getCharPref("spf.checkonload");
	}
	
	usedk = "";
	if (prefs.getPrefType("spf.domainkeys") == prefs.PREF_STRING) {
		usedk = prefs.getCharPref("spf.domainkeys");
	}
}

function spfGoEvent() {
	spfGo(false);
}

function spfGo(manual) {
	spfLoadSettings();
	
	// Get references to the XUL elements we use.
	spfBox = document.getElementById("spfBox");
	statusText = document.getElementById("spfStatusText");
	goMenu = document.getElementById("spf_GoMenu");
	goMenuSep = document.getElementById("spf_GoMenuSeparator");	
	spfLinkDiv = document.getElementById("spfLinkDiv");
	statusLink = document.getElementById("spfLink");
	statusTrust = document.getElementById("spfTrust");
	
	// Abort any previous SPF checks, and reset the XUL elements.
	
	xmlhttp.abort();
	
	spfBox.style.display = "none";
	statusText.style.color = null;
    statusText.style.display = "none";
	
	spfLinkDiv.style.display = "none";
	statusLink.href = "";
	if (!manual) {
		goMenu.hidden = true;
		goMenuSep.hidden = true;
	}

	// If no message is being read, bail out.
	
    if (!statusText) return;
	if (GetNumSelectedMessages() != 1) return;

	var uri = GetFirstSelectedMessage();
	if (!uri) return;

	statusText.style.display = null;
	
	if (checkonload == "no" && !manual) {
		goMenu.hidden = false;
		goMenuSep.hidden = false;
		statusText.value = "Click on Verify Sender (SPF) from the Tools menu.";
		return;
	}

	spfBox.style.display = null;

	// Check that a query server has been set up.  If not, display an error.
	
	if (!serverurl) {
		statusText.value = "No SPF query server has been configured.";
		return;
	}
	
	// Load the message service, and scan the message headers.

	statusText.value = "Scanning message headers...";	
	
    var msgService = messenger.messageServiceFromURI(uri);
    
	var consumer = Components.classes["@mozilla.org/network/sync-stream-listener;1"].createInstance();
	var consumer_inputstream = consumer.QueryInterface(Components.interfaces.nsIInputStream);
	var input = Components.classes["@mozilla.org/scriptableinputstream;1"].createInstance();
	var scriptableinput = input.QueryInterface(Components.interfaces.nsIScriptableInputStream);

	scriptableinput.init(consumer);
	try {
		msgService.streamMessage(uri, consumer, msgWindow, null, false, null)
	} catch (ex) {
		statusText.value = "Sender verification is not applicable for this message.";
		return;
	}
	
	var h = "";

	FromHdr = null;
	EnvFrom = null;
	DateHdr = null;
	
	HeloName = null;
	IPAddr = null;
	
	HeloName2 = null;
	IPAddr2 = null;
	
	DKHash = null;

	var mode = 0;
	var hcont = false;
	var hlast = "";
	var bytesread = 0;
	
	var DKHeader = null;
	var DKHeaderPostPosition = null;

	// For some reason, when reading an email with attachments, except for the first email read,
	// the next line freezes thunderbird.  Only with IMAP accounts I think.
	scriptableinput.available();
	
	// Read the headers character-by-character because I don't know a better way of doing this.
	var endofheaders = false;
	while (scriptableinput.available()) {
		var cs = scriptableinput.read(512)
		for (var csi = 0; csi < cs.length; csi++) {
		var c = cs.charAt(csi);
		bytesread++;
		
		if (c == "\r") { continue; }
		if ((c == " " || c == "\t") && h == "") { hcont = true; continue; }
		
		if (c != "\n") { h += c; continue; }
			
		// end of headers
		if (h == "") { endofheaders = true; break; }
		
		// handle a continued header line
		if (hcont) {
			if (hlast == "DK") {
				DKHeader += h;
				DKHeaderPostPosition = bytesread;
			}
			
			hcont = false;
			h = "";
			continue;
		}
		
		// handle header

		hlast = "";

		// Compare the header to the regular expressions.
		
		var m;
		
		m = ReturnPathRegEx.exec(h);
		if (m) { EnvFrom = m[1]; }
		
		m = FromRegEx.exec(h);
		if (m) {
			FromHdr = m[1];
			if (!FromHdr) { FromHdr = m[2]; }
		}
		
		m = DateRegEx.exec(h);
		if (m) { DateHdr = Date.parse(m[1]); }
		
		var he = null;
		var ip = null;
		
		m = ReceivedRegEx.exec(h);
		if (m) { he = m[1]; ip = m[2]; }
		
		m = ReceivedRegEx2.exec(h);
		if (m) { ip = m[1]; he = m[2]; }
			
		m = ReceivedRegEx3.exec(h);
		if (m) { ip = m[1]; he = m[2]; }

		if (he != null && ip != null) {
			var internal = 0;
			// TODO: check the fourth range: 172.16.0.0-172.31.255.255
			if (startsWith(ip, "127.0.0.") || startsWith(ip, "192.168.") || startsWith(ip, "10.")) {
				internal = 1;
			} else {
				// Check spf.host.* preferences to see if these are internal mail servers.
				var ip2 = ip;
				while (ip2 != null) {
					var prefname = "spf.host." + ip2;
					if (prefs.getPrefType(prefname) == prefs.PREF_STRING) {
						internal = (prefs.getCharPref(prefname) == "trust");
						if (internal) break;
					}
					
					// If this was a wildcard test, strip off the wildcard.
					if (endsWith(ip2, ".*")) { ip2 = ip2.substring(0, ip2.length-2); }
					
					// If there's a dot in the string, replace what's after the dot
					// with an asterisk, and continue checking.
					var dot = ip2.lastIndexOf(".");
					if (dot > 0) {
						ip2 = ip2.substring(0, dot+1) + "*";
					} else {
						// No more testing.
						ip2 = null;
					}
				}
			}
			
			if (!internal) {
				// This is the point where we should do an SPF check.
				if (mode == 0) {
					HeloName = he;
					IPAddr = ip;
				} else if (mode == 1) {
					// This gets the second matching Received: line information.
					HeloName2 = he;
					IPAddr2 = ip;
				}						
				mode++;
			}
		}
	
		if (startsWith(h, "DomainKey-Signature: ") && DKHeader == null) {
			// DKHeader != null to make sure we only read the first DK header in the message.
			DKHeader = h.substring(21, h.length);
			hlast = "DK";
			DKHeaderPostPosition = bytesread;
		}

		h = "";
		hcont = false;
		
		}
		if (endofheaders) break;
	}
	
	scriptableinput.close();
	consumer_inputstream.close();
	
	// What if there is no From: header
	if (!FromHdr) {
		statusText.value = "Cannot determine sender address from mail message.";
		statusText.style.color = "blue";
		return;
	}
	
	// If the message does not have a parseable date, flag an error.
	if (!DateHdr) {
		statusText.value = "Message date could not be determined.";
		return;
	}
	
	// If the message is old, there's no way to know whether something legitimate now
	// was legitimate when it was sent, or something illegitimate now might have
	// (confusingly) been legitimate at the time.
	if (new Date().getTime() - DateHdr > 1000*60*60*24*DAYS_TOO_OLD) {
		statusText.value = "Message is too old to verify sender.";
		return;
	}
	
	// For completeness, if a message was sent too far in the future, flag a problem.
	if (DateHdr - new Date().getTime() > 1000*60*60*24*DAYS_IN_THE_FUTURE) {
		statusText.value = "Message date is in the future.  Sender verification skipped.";
		return;
	}
	
	// When there aren't any matching Recevied: headers, the mail probably started
	// on the mail server itself.  Is this a security problem?
	if (!HeloName || !IPAddr) {
		statusText.value = "Mail appears to originate from your mail server.";
		return;
	}

	// Interpret the DK header
	if (FromHdr != null && DKHeader != null && DKHeader != "" && usedk == "yes") {
		mode = 0;
		h = "";
		var v;
		
		var DK_ALGO = "rsa-sha1";
		var DK_SIG = null;
		var DK_CAN = null;
		var DK_DOMAIN = null;
		var DK_HEADERS = null;
		var DK_QMETHOD = null;
		var DK_SELECTOR = null;
		
		for (var csi = 0; csi < DKHeader.length; csi++) {
			var c = DKHeader.charAt(csi);
			if (c == " " || c == "\t") continue;
			if (mode == 0) {
				if (c == "=") {
					mode = 1;
					v = "";
				} else {
					h += c;
				}
			} else {
				if (c != ";")
					v += c;
				if (c == ";" || csi == DKHeader.length-1) {
					switch (h) {
						case "a": DK_ALGO = v; break;
						case "b": DK_SIG = v; break;
						case "c": DK_CAN = v; break;
						case "d": DK_DOMAIN = v; break;
						case "h": DK_HEADERS = ":" + v.toLowerCase() + ":"; break;
						case "q": DK_QMETHOD = v; break;
						case "s": DK_SELECTOR = v; break;
					}
					
					mode = 0;
					h = "";
				}
			}
		}
		
		// Check that required tags are present, and if so compute the email hash
		if (DK_SIG != null && (DK_CAN == "simple" || DK_CAN == "nofws") && DK_DOMAIN != null && DK_QMETHOD != null && DK_SELECTOR != null && (endsWith(FromHdr, "@" + DK_DOMAIN) || endsWith(FromHdr, "." + DK_DOMAIN))) {
			// Load up a new scriptable input stream
			var consumer = Components.classes["@mozilla.org/network/sync-stream-listener;1"]
				.createInstance().QueryInterface(Components.interfaces.nsIInputStream);
			var input = Components.classes["@mozilla.org/scriptableinputstream;1"]
				.createInstance().QueryInterface(Components.interfaces.nsIScriptableInputStream);
			input.init(consumer);
			msgService.streamMessage(uri, consumer, msgWindow, null, false, null)
			
			// Move past the first DK header
			input.read(DKHeaderPostPosition);
			
			// Start reading the email in chunks of lines.  Both hash methods are line-based.
			mode = 0;
			var line = "";
			var hashdata = "";
			var hlast = null;
			var hcont = false;
			var trailingLines = "";
			
			sha1_incremental_init();
			
			while (input.available()) {
				var cs = input.read(512);
				
				// Ensure the email ends with a new line so the last line
				// is proceesed.
				if (!input.available() && !endsWith(cs, "\n"))
					cs += "\n";
				
				for (var csi = 0; csi < cs.length; csi++) {
					var c = cs.charAt(csi);
					
					if (mode == 0 && line == "" && (c == "\t" || c == " "))
						hcont = true;
					
					// Remove folding whitespace
					if (DK_CAN == "nofws" && (c == "\t" || c == " ")) continue;
					
					if (c == "\r") { continue; }
					if (c != "\n") { line += c; continue; }
					
					// We've reached the end of a line
					
					var skipLine = false;
					
					// If the "h" tag is used, only those header lines (and their
					// continuation lines if any) added to the "h" tag list are
					// included.
					if (mode == 0 && DK_HEADERS != null && line != "") {
						// What is the header of this line.
						var header;
						if (hcont) {
							header = hlast;
						} else {
							var colon = line.indexOf(":");
							header = line.substring(0, colon).toLowerCase();
							hlast = header;
						}
						
						if (DK_HEADERS.indexOf(":" + header + ":") == -1) {
							// skip this header
							skipLine = true;
						}
					}
					
					line += "\r\n";
					
					// Trailing empty lines are ignored.  They are added back
					// the next time we have data.
					if (line == "\r\n") {
						skipLine = true;
						trailingLines += line;
					}
					
					if (!skipLine) {
						// We have data, so any lines buffered that might have been trailing
						// are taken out of the buffer and put into the hashdata.
						hashdata += trailingLines;
						trailingLines = "";

						if (DK_CAN == "nofws" && mode == 0 && hcont && hashdata.length >= 2) {
							// Header continuation lines are unwrapped so that header lines are
							// processed as a single line.  This involves double-backing on
							// hashdata: removing the last line ending.
							hashdata = hashdata.substring(0, hashdata.length-2);
						}
					
						hashdata += line;
					}
						
					// Don't feed the hash algorithm in the header section because
					// with the nofws method, hashdata changes when there are header
					// continuation lines.
					while (mode == 1 && hashdata.length >= (64*4)) {
						var hasharg = hashdata.substring(0, (64*4));
						hashdata = hashdata.substring(hasharg.length, hashdata.length);
						sha1_incremental_block(hasharg, false);
					}
					
					// end of headers
					if (mode == 0 && line == "\r\n") { mode = 1; }
					
					line = "";
					hcont = false;
				}
			}

			if (hashdata.length > 0)
				sha1_incremental_block(hashdata, true);
			
			DKHash = sha1_incremental_end_base64();
			
			// Close the stream
			input.close();
		}
	}

	
	// Run the query.
	
	SPFSendQuery(HeloName, IPAddr, FromHdr, DKHash == null ? null : DKHeader, "spfGo3()", serverurl);
}

function spfGo3() {	
	retFrom = ret;
	retEnv = null;
	
	// If a DomainKeys signature verified...
	if (DKHash != null && startsWith(retFrom.dksig, DKHash)) {
		retFrom.result = "pass";
		retFrom.comment = "DK";
	}
	
	// If the From: address did not pass and there is a different envelope
	// address, scan that address.
	if (EnvFrom && EnvFrom != FromHdr && retFrom.result != "pass") {
		SPFSendQuery(HeloName, IPAddr, EnvFrom, null, "spfGo5()", "forward or forged");
		return;
	}
		
	spfGoFinish();
}

function spfGo5() {
	retEnv = ret;
	
	// If the envelope passed, then possibly this is a forwarded message.
	// If the user trusts the forwarder, see if the *next* Received: line
	// authorizes the use of the From: address.
	var prefname = "spf.forwarder." + retEnv.domain;
	retEnv.trust = 0;
	if (retEnv.result == "pass" && prefs.getPrefType(prefname) == prefs.PREF_STRING && prefs.getCharPref(prefname) == "trust"
		&& HeloName2 && IPAddr2) {
		retEnv.trust = 1;
		SPFSendQuery(HeloName2, IPAddr2, FromHdr, null, "spfGo6()", "forward check");
		return;
	}
	
	spfGoFinish();
}

function spfGo6() {
	var retFrom2 = ret;
	if (retFrom2 && retFrom2.result != "fail") {
		retFrom = retFrom2;
	}
	
	spfGoFinish();
}

function spfGoFinish() {	
	// When the sender is not verified...
	if (retFrom.result != "pass") {
		// Show the second line of explanations
		spfLinkDiv.style.display = null;
		statusTrust.style.display = null;

		// There better be a link in the comment, so set up the link for it.
		var CommentUrlRegEx = /(http:[^ ]+)/;
		var curl = CommentUrlRegEx.exec(retFrom.comment);
		if (curl) {
			statusLink.href = curl[1];
		} else {
			statusLink.href = "about:blank";
		}
		
		// If the From: address failed but the envelope passed and the envelope sender is not
		// trusted, the user might want to trust the envelope sender.
		if (retEnv && retEnv.result == "pass" && !retEnv.trust) {
			statusText.value = "Warning: Sender is <" + retEnv.domain + ">.  Address below may be forged.";
			statusText.style.color = "red";
			statusTrust.linktype = "forwarder";
			statusTrust.mta = retEnv.domain;
			statusTrust.childNodes[0].nodeValue = "Is " + retEnv.domain + " a mail list?";
			return;
		}
		
		// If the forwarder is trusted, don't show the internal network message. 
		if (retEnv && retEnv.trust) {
			statusTrust.style.display = "none";
		} else {
			// If it's not possibly a forwarder, then show the internal network server link.
			statusTrust.childNodes[0].nodeValue = "Is " + HeloName + " in your network?";
			statusTrust.linktype = "mta";
			statusTrust.mta = IPAddr;
			statusTrust.reversedns = retFrom.reversedns;
		}
	}
	
	// Show the user the result of the query.
	
	switch (retFrom.result) {
		case "pass":
			statusText.value = "Sender Domain Verified";
			if (retEnv && retEnv.trust)
				statusText.value += " (via " + retEnv.domain + ")";
			if (retFrom.comment == "DK")
				statusText.value += " (with DomainKeys)";
			break;
		case "fail":
			statusText.value = "Forged Address.  This is not a legitimate <" + retFrom.domain + "> email.";
			statusText.style.color = "red";
			break;
		case "softfail":
		case "neutral":
			statusText.value = "Sender cannot be verified by domain.  Address could be forged.";
			statusText.style.color = "blue";
			break;
		case "none":
			statusText.value = "Domain <" + retFrom.domain + "> does not support SPF sender verification.";
			statusText.style.color = "blue";
			break;
		case "spamming":
		case "phishing":
			statusText.value = retFrom.comment;
			statusText.style.color = "red";
			break;
		default:
			statusText.value = "Error: " + retFrom.comment;
			statusText.style.color = "red";
			break;
	}
}

function SPFSendQuery(helo, ip, email, dkheader, func, status) {
	statusText.value = "Contacting SPF query server...";
	
	// Prepare the URL of the query.
	
	var url = serverurl;
	url += "?agent=" + useragent;
	url += "&helo=" + helo + "&ip=" + ip + "&envfrom=" + email;
	
	if (dkheader != null) {
		url += "&dk=" + dkheader;
	}
	
	// Query the server.

	xmlhttp.open("GET", url, true);
	xmlhttp.onerror=function() {
		statusText.value = "Error verifying sender: " + xmlhttp.statusText;
		statusText.style.color = "blue";
	};
	xmlhttp.onload = function() {
		SPFSendQuery2(email, func);
	};
	xmlhttp.send(null);
}

function SPFSendQuery2(email, func) {	
	// Don't know how better to get the information out of the XML...
	
	var e = xmlhttp.responseXML.documentElement.firstChild;
	while (e && e.nodeName != "response") {
		e = e.nextSibling;
	}
	if (!e) {
		statusText.value = "Server error.";
		statusText.style.color = "blue";
		return;
	}
	
	var result;
	var comment;
	var reversedns;
	var dksig;
	
	e = e.firstChild;
	while (e) {
		if (e.nodeName == "result") { result = e.textContent; }
		if (e.nodeName == "comment") { comment = e.textContent; }
		if (e.nodeName == "reversedns") { reversedns = e.textContent; }
		if (e.nodeName == "dk-expected-hash") { dksig = e.textContent; }
		e = e.nextSibling;
	}

	// Get the domain-part of the address.

	var DomainRegEx = /@([\w\d\._-]+)$/i;
	var m = DomainRegEx.exec(email);
	var domain = m[1];
	
	// Return
	ret = new QueryRet(result, comment, domain, reversedns, dksig);
	window.setTimeout(func, 1);
}

function QueryRet(result, comment, domain, reversedns, dksig) {
	this.result = result;
	this.comment = comment;
	this.domain = domain;
	this.reversedns = reversedns;
	this.dksig = dksig;
}

function MyUrlListener() {
	this.OnStartRunningUrl = function(url) { alert("Start" + url); }
	this.OnStopRunningUrl = function(url, status) { alert("Stop " + staus + ": " + url); }
}

function startsWith(a, b) {
	if (b.length > a.length) return false;
	return a.substring(0, b.length) == b;
}
function endsWith(a, b) {
	if (b.length > a.length) return false;
	return a.substring(a.length-b.length) == b;
}


