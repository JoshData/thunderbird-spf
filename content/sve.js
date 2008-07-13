/*
 * MOZILLA THUNDERBIRD EXTENSION FOR SENDER VERIFICATION
 *
 * Copyright 2004-2005 Joshua Tauberer <http://razor.occams.info>
 *
 * Feel free to use and copy and modify this file however you like.
 *
 * While I disagree with the claim of the below statement, I must CYA
 * and include:  This code incorporates intellectual property owned by
 * Yahoo! and licensed pursuant to the Yahoo! DomainKeys Patent License
 * Agreement.
 */

// CONSTANTS

var useragent = "sve:0.7"; // The useragent field sent to the query server
var sveHttpUserAgent = "Sender Verification Extension for Mozilla Thunderbird 0.8";

// REGULAR EXPRESSIONS

var ReturnPathRegEx = /^Return-Path:\s+<([^>]+)>/;
var ReceivedRegEx = /^Received:\s+from ([\w\W]+) \([\w\W]*\[([\d\.]+)\]/; // The sendmail-style Received: header.
var ReceivedRegEx2 = /^Received:\s+from \[([\d\.]+)\] \([\w\W]*helo=([^)]+)\)/; // An apparently Exim-style header: Received: from [65.54.185.19] (...helo=hotmail.com)
var ReceivedRegEx3 = /^Received:\s+from ([\w\.\-\_]+) [\(\[]([\d\.]+)[\)\]]/; // Yet another format
var ReceivedRegEx4 = /^Received:\s+from [\w\W]+\((EHLO|HELO) ([^)]+)\) \(([\d\.]+)\)/; // Yet another format
var ReceivedRegEx5 = /^Received:\s+from \s*\[([\d\.]+)\] [\w\W]*\(EHLO ([^)]+)\)/; // ArGoSoft Mail Server Pro
var FromRegEx = /^From:\s+[^<]*<([^>]+)>|^From:\s+([\w\d\._\-]+@[\w\d\.\_\-]+)/i;	
var DateRegEx = /^Date:\s+([\w\W]+)/i;

// MISC

var xmlhttp = new XMLHttpRequest();
var xmlhttp2 = new XMLHttpRequest();
var xmlhttp_phishtank = new XMLHttpRequest();

var DAYS_TOO_OLD = 7; // THIS MANY DAYS IN THE PAST => NO SPF CHECK
var DAYS_IN_THE_FUTURE = 1.1; // THIS MANY DAYS IN THE FUTURE => NO SPF CHECK

// PREFERENCES

var serverurl = "";
var checkonload = "";
var usedk = "";
var warnunverified;
var checkrbls;
var onlystatusbar;
var checkab;
var sve_internal_mtas;
var sve_internal_mtas_configured;
var sve_nocheckdomains;

// GLOBAL VARIABLES
// Yes it's a bad way to program, but it seems necessary in order
// to put some code in the xmlhttp callbacks.

var spfBox;
var statusText;
var statusLink;
var statusTrust;
var goMenu;
var goMenuSep;
var statusLittleBox;

var QueryCache = Array(0);
var QueryCacheNext = 0;
var QueryCacheMax = 100;

var lastCheckedEmail;

var recentSenderIps = Object();

// Whenever the messagepane loads, run a SPF check.
var messagepane = document.getElementById("messagepane");
messagepane.addEventListener("load", sveRearrangeBoxes, true);
messagepane.addEventListener("load", spfGoEvent, true);

//SVE_TestReceivedLine("");

function spfLoadSettings() {
	var prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch);

	serverurl = "http://razor.occams.info/code/spf/cgi-bin/query.cgi";
	if (prefs.getPrefType("spf.queryserver") == prefs.PREF_STRING) {
		if (prefs.getCharPref("spf.queryserver") != "")
			serverurl = prefs.getCharPref("spf.queryserver");
	}
	
	// Check on mail load?
	checkonload = "";
	if (prefs.getPrefType("spf.checkonload") == prefs.PREF_STRING) {
		checkonload = prefs.getCharPref("spf.checkonload");
	}
	
	usedk = "no";
	if (prefs.getPrefType("spf.domainkeys") == prefs.PREF_STRING) {
		usedk = prefs.getCharPref("spf.domainkeys");
	}
	
	warnunverified = false;
	if (prefs.getPrefType("spf.warnunverified") == prefs.PREF_STRING
		&& prefs.getCharPref("spf.warnunverified") == "yes") {
		warnunverified = true;
	}
	
	onlystatusbar = false;
	if (prefs.getPrefType("spf.onlystatusbar") == prefs.PREF_STRING
		&& prefs.getCharPref("spf.onlystatusbar") == "yes") {
		onlystatusbar = true;
	}
	
	checkrbls = true;
	if (prefs.getPrefType("spf.rbls") == prefs.PREF_STRING
		&& prefs.getCharPref("spf.rbls") == "no") {
		checkrbls = false;
	}
	
	checkab = true;
	if (prefs.getPrefType("spf.addressbook") == prefs.PREF_STRING
		&& prefs.getCharPref("spf.addressbook") == "no") {
		checkab = false;
	}
	
	sve_nocheckdomains = Array(0);
	if (prefs.getPrefType("spf.nocheckdomains") == prefs.PREF_STRING) {
		sve_nocheckdomains = prefs.getCharPref("spf.nocheckdomains").replace(" ", "", "g").split(",");
	}
	
	sve_internal_mtas = Array(0);
	sve_internal_mtas_configured = false;
	if (prefs.getPrefType("spf.internal_mtas") == prefs.PREF_STRING) {
		var p = prefs.getCharPref("spf.internal_mtas");
		if (p != "")
			sve_internal_mtas = p.split(',');
	}
	if (sve_internal_mtas.length > 0) sve_internal_mtas_configured = true;
	sve_internal_mtas.push("127.0.0.0/24");
	sve_internal_mtas.push("192.168.0.0/16");
	sve_internal_mtas.push("172.16.0.0/12");
	sve_internal_mtas.push("10.0.0.0/8");
}

function spfGoEvent() {
	// The timeout prevents a hang when loading IMAP messages with attachments
	window.setTimeout("spfGo(false);", 250);
}

var sveRearrangedBoxes = false;
function sveRearrangeBoxes() {
	// Mnenhy likes to replace the header box, so we need to insert a new
	// vbox between the hbox that is expandedHeaderView and its parent,
	// so we can put our box on top of the expandedHeaderView.
	
	if (sveRearrangedBoxes) return;
	sveRearrangedBoxes = true;
	
	var spfBox = document.getElementById("spfBox");
	var widget = document.getElementById("expandedHeaderView");
	var curContainer = widget.parentNode;
	var newContainer = document.createElement("vbox");
	curContainer.insertBefore(newContainer, widget);
	curContainer.removeChild(widget);
	newContainer.appendChild(widget);
	newContainer.insertBefore(spfBox, widget);
}

function spfGo(manual) {
	// Prevent two load events on the same email.
	var uri = GetFirstSelectedMessage();
	if (uri == lastCheckedEmail && !manual) return;
	lastCheckedEmail = uri;

	spfLoadSettings();
	
	// Get references to the XUL elements we use.
	spfBox = document.getElementById("spfBox");
	statusText = document.getElementById("spfStatusText");
	goMenu = document.getElementById("spf_GoMenu");
	goMenuSep = document.getElementById("spf_GoMenuSeparator");	
	statusLink = document.getElementById("spfLink");
	statusTrust = document.getElementById("spfTrust");
	statusLittleBox = document.getElementById("statusTextSVE");
	
	var spfDomainWarning = document.getElementById("spfDomainWarning");
	spfDomainWarning.style.display = "none";
	
	// Abort any previous SPF checks, and reset the XUL elements.
	
	xmlhttp.abort();
	
	spfBox.style.display = "none";
	statusText.style.color = null;
    statusText.style.display = "none";
	
	statusLink.style.display = "none";
	statusTrust.style.display = "none";
	if (!manual) {
		goMenu.hidden = true;
		goMenuSep.hidden = true;
	}
	
	statusLittleBox.style.display = "none";
	statusLittleBox.onclick = null;
	statusLittleBox.style.color = null;

	// If no message is being read, bail out.
	
    if (!statusText) return;
	if (GetNumSelectedMessages() != 1) return;

	if (!uri) return;
	if (uri.indexOf("news-message://") == 0) return;
	if (uri.indexOf("file://") == 0) return; // leads to a segfault otherwise
	
	// If we're in offline mode, bail out.  Apparently not supported in TBird 1.0.7.
	try {
		var ioservice =
	Components.classes["@mozilla.org/network/util;1"].getService().QueryInterface(Components.interfaces.nsIIOService);
		if (ioservice.offline) return;
	} catch (e) {
	}

	statusText.style.display = null;
	
	if (checkonload == "no" && !manual) {
		goMenu.hidden = false;
		goMenuSep.hidden = false;
		statusText.childNodes[0].nodeValue = SVE_STRINGS.DO_VERIFY; // not visible...
		return;
	}

	if (!onlystatusbar)
		spfBox.style.display = null;
	else
		statusLittleBox.style.display = null;
	
	// Load the message service, and scan the message headers.

	statusText.childNodes[0].nodeValue = SVE_STRINGS.SCANNING_HEADERS;
	statusLittleBox.label = SVE_STRINGS.SCANNING;
	
	var msgInfo = new Object();
	
	msgInfo.uri = uri;
	
	msgInfo.FromHdr = null;
	msgInfo.EnvFrom = null;
	msgInfo.DateHdr = null;
	
	msgInfo.HeloName = null;
	msgInfo.IPAddr = null;
	
	msgInfo.HeloName2 = null;
	msgInfo.IPAddr2 = null;
	
	msgInfo.IsViaMailList = false;
	
	msgInfo.DKHeader = null;
	msgInfo.DKHash = null;
	
	var msgService = messenger.messageServiceFromURI(uri);

	msgInfo.HeaderObj = messenger.msgHdrFromURI(uri);
	
    var dataListener = {
		stream : null,
		h : "",
		mode : 0, // 0=Looking for first Received:, 1=Looking for second Received:
		hcont : false,
		hlast : "",
		bytesread : 0,
		
		onStartRequest: function(request, context) {},
		onStopRequest: function(request, context, status) { },
		onDataAvailable: function(request, context, inputStream, offset, count) {
			if (this.stream == null) {
				this.stream = Components.classes["@mozilla.org/binaryinputstream;1"]
				  .createInstance(Components.interfaces.nsIBinaryInputStream);
				this.stream.setInputStream(inputStream);
			}
			
			var c;
			var csi;
			var endofheaders = false;
			
			// PARSE THE HEADERS
			for (csi = 0; csi < count; csi++) {
				c = String.fromCharCode(this.stream.read8());
				this.bytesread++;
				
				if (c == "\r") { continue; }
				if ((c == " " || c == "\t") && this.h == "") { this.hcont = true; continue; }
				
				if (c != "\n") { this.h += c; continue; }
				
				// end of headers
				if (this.h == "") { endofheaders = true; break; }
				
				// handle a continued header line
				if (this.hcont) {
					if (this.hlast == "DK") {
						msgInfo.DKHeader += this.h;
						msgInfo.DKHeaderPostPosition = this.bytesread;
					}
					
					this.hcont = false;
					this.h = "";
					continue;
				}
				
				// handle header
		
				this.hlast = "";
		
				// Compare the header to the regular expressions.
				
				var m;
				
				m = ReturnPathRegEx.exec(this.h);
				if (m) { msgInfo.EnvFrom = m[1].toLowerCase(); }
				
				// TODO: What if the From address is split onto two lines.....
				m = FromRegEx.exec(this.h);
				if (m) {
					msgInfo.FromHdr = m[1];
					if (!msgInfo.FromHdr) { msgInfo.FromHdr = m[2]; }
					msgInfo.FromHdr = msgInfo.FromHdr.toLowerCase();
				}
				
				m = DateRegEx.exec(this.h);
				if (m) { msgInfo.DateHdr = Date.parse(m[1]); }
				
				var receivedParse = SVE_ParseReceivedLine(this.h);
				
				var he = receivedParse.he;
				var ip = receivedParse.ip;
				
				if (he != null && ip != null) {
					var internal = 0;
					for (var mta_index = 0; mta_index < sve_internal_mtas.length; mta_index++) {
						var ip2 = sve_internal_mtas[mta_index];
						var cidr = 32;
						var slash = ip2.indexOf("/");
						if (slash != -1) {
							cidr = parseInt(ip2.substring(slash+1));
							if (isNaN(cidr)) cidr = 32;
							ip2 = ip2.substring(0, slash);
						}
						
						if (endsWith(ip2, ".*")) {
							ip2 = ip2.substring(0, ip2.length-1);
							if (startsWith(ip, ip2)) {
								internal = 1;
								break;
							}
						} else if (SPF_TestIP(ip, ip2, cidr)) {
							internal = 1;
							break;
						}
					}
						
					if (!internal) {
						// This is the point where we should do an SPF check.
						if (this.mode == 0) {
							msgInfo.HeloName = he;
							msgInfo.IPAddr = ip;
						} else if (this.mode == 1) {
							// This gets the second matching Received: line information.
							msgInfo.HeloName2 = he;
							msgInfo.IPAddr2 = ip;
						}						
						this.mode++;
					}
				}
			
				if (startsWith(this.h, "DKIM-Signature: ") && msgInfo.DKHeader == null) {
					// DKHeader != null to make sure we only read the first DKIM header in the message.
					msgInfo.DKHeader = this.h.substring(21, this.h.length);
					this.hlast = "DK";
					msgInfo.DKHeaderPostPosition = this.bytesread; // message hash starts from this position
				}
				
				if (startsWith(this.h, "List-Id: ")) {
					msgInfo.IsViaMailList = true;
				}
		
				this.h = "";
				this.hcont = false;
			}
			
			if (endofheaders) {
				/*
				try {
					var hdr = messenger.msgHdrFromURI(msgInfo.uri);
					var storedstatus = hdr.getStringProperty("razor.occams.info/code/spf::status");
					if (storedstatus != null && storedstatus != "" && !manual) {
						storedstatus = storedstatus.split("\n");
						if (storedstatus.length > 0 && storedstatus[0] == "0") {
							msgInfo.QueryReturn = new Object();
							msgInfo.QueryReturn.ComputedDate = storedstatus[1];
							msgInfo.QueryReturn.domain = storedstatus[2];
							msgInfo.QueryReturn.result = storedstatus[3];
							msgInfo.QueryReturn.comment = storedstatus[4];
							msgInfo.QueryReturn.IsFromStorage = true;
							SVE_OnQueriesComplete(msgInfo);
							return;
						}
					}
				} catch (e) {
				}
				*/
				
				SVE_StartCheck(msgInfo);
				throw "IGNORE_THIS__NOT_A_REAL_PROBLEM"; // abort reading the message since we don't need any more of it
			}
		}
    };

	var async_consumer = Components.classes["@mozilla.org/network/async-stream-listener;1"].createInstance();
	var async_consumer2 = async_consumer.QueryInterface(Components.interfaces.nsIAsyncStreamListener);

	async_consumer2.init(dataListener, null);

	try {
		msgService.streamMessage(uri, async_consumer, msgWindow, null, false, null)
	} catch (ex) {
		statusText.childNodes[0].nodeValue = SVE_STRINGS.NOT_APPLICABLE1;
		statusLittleBox.label = SVE_STRINGS.NOT_APPLICABLE2;
		return;
	}
	
}

function SVE_ParseReceivedLine(h) {
	var m;
	var he = null;
	var ip = null;
	
	m = ReceivedRegEx.exec(h);
	if (m) { he = m[1]; ip = m[2]; }
	
	m = ReceivedRegEx2.exec(h);
	if (m) { ip = m[1]; he = m[2]; }
		
	m = ReceivedRegEx3.exec(h);
	if (m) { he = m[1]; ip = m[2]; }

	m = ReceivedRegEx4.exec(h);
	if (m) { he = m[2]; ip = m[3]; }

	m = ReceivedRegEx5.exec(h);
	if (m) { ip = m[1]; he = m[2]; }
	
	return { he: he, ip: ip };
}

function SVE_TestReceivedLine(h) {
	var ret = SVE_ParseReceivedLine(h);
	alert("IP=" + ret.ip + "; HELO=" + ret.he);
}

function SVE_StartCheck(msgInfo) {
	if (msgInfo.IsViaMailList) {
		// If this is a mail list email, don't bother trying to check the FromAddress
		// since SPF will certainly fail, and DK will probably fail since messages
		// are usually appended with a mail list footer.
		msgInfo.FromHdr = msgInfo.EnvFrom;
	}
	
	if (msgInfo.FromHdr != null && SVE_GetDomain(msgInfo.FromHdr) == null) msgInfo.FromHdr = null;
	if (msgInfo.EnvFrom != null && SVE_GetDomain(msgInfo.EnvFrom) == null) msgInfo.EnvFrom = null;
	
	// What if there is no From: header
	if (!msgInfo.FromHdr) {
		statusText.childNodes[0].nodeValue = SVE_STRINGS.CANNOT_FIND_FROM;
		statusText.style.color = "blue";
		statusLittleBox.label = SVE_STRINGS.NOT_APPLICABLE2;
		return;
	}
	
	// If the message does not have a parseable date, flag an error.
	/*if (!DateHdr) {
		statusText.childNodes[0].nodeValue = "Message date could not be determined.";
		return;
	}*/
	
	// If the message is old, there's no way to know whether something legitimate now
	// was legitimate when it was sent, or something illegitimate now might have
	// (confusingly) been legitimate at the time.
	if (msgInfo.DateHdr != null && new Date().getTime() - msgInfo.DateHdr > 1000*60*60*24*DAYS_TOO_OLD) {
		statusText.childNodes[0].nodeValue = SVE_STRINGS.MESSAGE_TOO_OLD;
		statusLittleBox.label = SVE_STRINGS.NOT_APPLICABLE2;
		return;
	}
	
	// For completeness, if a message was sent too far in the future, flag a problem.
	if (msgInfo.DateHdr != null && msgInfo.DateHdr - new Date().getTime() > 1000*60*60*24*DAYS_IN_THE_FUTURE) {
		statusText.childNodes[0].nodeValue = SVE_STRINGS.MESSAGE_IN_FUTURE;
		statusLittleBox.label = SVE_STRINGS.NOT_APPLICABLE2;
		return;
	}
	
	// When there aren't any matching Recevied: headers, the mail probably started
	// on the mail server itself.  Is this a security problem?
	if (!msgInfo.HeloName || !msgInfo.IPAddr) {
		statusText.childNodes[0].nodeValue = SVE_STRINGS.LOCAL_MAIL;
		statusLittleBox.label = SVE_STRINGS.NOT_APPLICABLE2;
		return;
	}
	
	for (var i = 0; i < sve_nocheckdomains.length; i++) {
		if ((SVE_GetDomain(msgInfo.FromHdr) == sve_nocheckdomains[i]) || startsWith(SVE_GetDomain(msgInfo.FromHdr), "." + sve_nocheckdomains[i])) {
			statusText.childNodes[0].nodeValue = SVE_STRINGS.DOMAIN_LISTED_NOT_CHECKED;
			statusLittleBox.label = SVE_STRINGS.NOT_APPLICABLE2;
			return;
		}
	}

	SVE_BeginCheck(msgInfo);
	
	// Protect all links.  This was an interesting idea, but it's disabled for now.
	// SVE_ProtectLinks(document.getElementById("messagepane").contentDocument);
	
}

function SVE_TryDK(msgInfo) {
	var csi;
	var mode;
	var h;
	var c;
	
	// Interpret the DK header
	if (msgInfo.FromHdr != null && msgInfo.DKHeader != null && msgInfo.DKHeader != "") {
		mode = 0;
		h = "";
		var v;
		
		var DK_VERSION = null;
		var DK_ALGO = null;
		var DK_SIG = null;
		var DK_HASH = null;
		var DK_CAN = "simple/simple";
		var DK_DOMAIN = null;
		var DK_HEADERS = null;
		var DK_IDENTITY = null;
		var DK_BODYLENGTH = null;
		var DK_QMETHOD = "dns/txt";
		var DK_SELECTOR = null;
		var DK_TIMESTAMP = null;
		var DK_EXPIRATION = null;
		var DK_COPIEDHEADERS = null;
		
		for (csi = 0; csi < msgInfo.DKHeader.length; csi++) {
			c = msgInfo.DKHeader.charAt(csi);
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
				if (c == ";" || csi == msgInfo.DKHeader.length-1) {
					switch (h) {
						case "v": DK_VERSION = v; break;
						case "a": DK_ALGO = v; break;
						case "b": DK_SIG = v; break;
						case "bh": DK_HASH = v; break;
						case "c": DK_CAN = v; break;
						case "d": DK_DOMAIN = v.toLowerCase(); break;
						case "h": DK_HEADERS = ":" + v.toLowerCase() + ":"; break;
						case "i": DK_IDENTITY = v.toLowerCase(); break;
						case "l": DK_BODYLENGTH = v; break;
						case "q": DK_QMETHOD = v; break;
						case "s": DK_SELECTOR = v; break;
						case "t": DK_TIMESTAMP = v; break;
						case "x": DK_EXPIRATION = v; break;
						case "z": DK_COPIEDHEADERS = v; break;
					}
					
					mode = 0;
					h = "";
				}
			}
		}
		
		// TODO: This domain MUST be the same as or a parent domain of the "i=" tag (the signing identity, as described below), or it MUST meet the requirements for parent domain signing described in Section 3.8. 
		
		// Check that required tags are present, and if so compute the email hash
		if (DK_SIG != null && (DK_CAN == "simple" || DK_CAN == "nofws") && DK_DOMAIN != null && DK_QMETHOD != null && DK_SELECTOR != null) {
			statusText.childNodes[0].nodeValue = SVE_STRINGS.DK_COMPUTING_SIGNATURE;
			statusLittleBox.label = SVE_STRINGS.CHECKING_DK;
	
			var dataListener = {
				stream : null,
				mode : 0,
				line : "",
				hashdata : "",
				trailingLines : "",
				hcont : false,
				hlast : null,
				bytesread : 0,
				
				onStartRequest: function(request, context) {
					sha1_incremental_init();
				},
				onStopRequest: function(request, context, status) {
					if (this.bytesread == 0) { // some sort of error
						return;
					}
					
					// If there was data at the end of the email without a newline,
					// then append it to the yet-to-be-hashed data with a newline character.
					if (this.line != "")
						this.hashdata = this.hashdata + this.line + "\r\n";
					
					if (this.hashdata.length > 0) {
						sha1_incremental_block(this.hashdata, true);
						//alert(hashdata);
					}
					
					msgInfo.DKHash = sha1_incremental_end_base64();
					
					SPFSendDKQuery(msgInfo.HeloName, msgInfo.IPAddr, msgInfo.FromHdr, msgInfo.EnvFrom != null && msgInfo.EnvFrom != msgInfo.FromHdr ? msgInfo.EnvFrom : null, msgInfo.DKHeader, msgInfo.DKHash, msgInfo, SVE_OnQueriesComplete);
				},
				
				onDataAvailable: function(request, context, inputStream, offset, count) {
					if (this.stream == null) {
						this.stream = Components.classes["@mozilla.org/binaryinputstream;1"]
						  .createInstance(Components.interfaces.nsIBinaryInputStream);
						this.stream.setInputStream(inputStream);
					}
					
					while (this.bytesread < msgInfo.DKHeaderPostPosition && count > 0) {
						this.bytesread++;
						count--;
						this.stream.read8();
					}
					if (count == 0) return;
					
					if (this.bytesread > 20000) {
						this.bytesread = 0;
						statusText.childNodes[0].nodeValue = SVE_STRINGS.DK_ABORTED1;
						statusLittleBox.label = SVE_STRINGS.DK_ABORTED2;
						throw "TOOLONG";
					}
					
					var c;
					var csi;
					
					// PARSE THE HEADERS
					for (csi = 0; csi < count; csi++) {
						c = String.fromCharCode(this.stream.read8());
						this.bytesread++;

						if (this.mode == 0 && this.line == "" && (c == "\t" || c == " "))
							this.hcont = true;
						
						// Remove folding whitespace
						if (DK_CAN == "nofws" && (c == "\t" || c == " ")) continue;
						
						if (c == "\r") { continue; }
						if (c != "\n") { this.line += c; continue; }
					
						// We've reached the end of a line
						
						var skipLine = false;
						
						// If the "h" tag is used, only those header lines (and their
						// continuation lines if any) added to the "h" tag list are
						// included.
						if (this.mode == 0 && DK_HEADERS != null && this.line != "") {
							// What is the header of this line.
							var header;
							if (this.hcont) {
								header = this.hlast;
							} else {
								var colon = this.line.indexOf(":");
								header = this.line.substring(0, colon).toLowerCase();
								this.hlast = header;
							}
							
							if (DK_HEADERS.indexOf(":" + header + ":") == -1) {
								// skip this header
								skipLine = true;
							}
						}
						
						this.line += "\r\n";
						
						// Trailing empty lines are ignored.  They are added back
						// the next time we have data.
						if (this.line == "\r\n") {
							skipLine = true;
							this.trailingLines += this.line;
						}
						
						if (!skipLine) {
							// We have data, so any lines buffered that might have been trailing
							// are taken out of the buffer and put into the hashdata.
							this.hashdata += this.trailingLines;
							this.trailingLines = "";
	
							if (DK_CAN == "nofws" && this.mode == 0 && this.hcont && this.hashdata.length >= 2) {
								// Header continuation lines are unwrapped so that header lines are
								// processed as a single line.  This involves double-backing on
								// hashdata: removing the last line ending.
								this.hashdata = this.hashdata.substring(0, this.hashdata.length-2);
							}
						
							this.hashdata += this.line;
						}
							
						// Don't feed the hash algorithm in the header section because
						// with the nofws method, hashdata changes when there are header
						// continuation lines.  Also, ensure there is data left in hashdata
						// after this so that it can be used at the very end to close
						// the hash computation.
						while (this.mode == 1 && this.hashdata.length > (64*12)) {
							var hasharg = this.hashdata.substring(0, (64*12));
							this.hashdata = this.hashdata.substring(hasharg.length, this.hashdata.length);
							sha1_incremental_block(hasharg, false);
							//alert(hasharg);
						}
						
						// end of headers
						if (this.mode == 0 && this.line == "\r\n") { this.mode = 1; }
						
						this.line = "";
						this.hcont = false;
					}
				}
			}
			
			var uri = GetFirstSelectedMessage();
			var msgService = messenger.messageServiceFromURI(uri);
			
			var async_consumer = Components.classes["@mozilla.org/network/async-stream-listener;1"].createInstance();
			var async_consumer2 = async_consumer.QueryInterface(Components.interfaces.nsIAsyncStreamListener);
		
			async_consumer2.init(dataListener, null);
		
			try {
				msgService.streamMessage(uri, async_consumer, msgWindow, null, false, null)
				return true;
			} catch (ex) {
				statusText.childNodes[0].nodeValue = ex;
				statusLittleBox.label = SVE_STRINGS.ERROR;
				return false;
			}
		}
	}
	
	return false;
}

function SVE_ProtectLinks(document) {
	var links = document.getElementsByTagName("a");
	var i;
	for (i = 0; i < links.length; i++)
		SVE_ProtectLink(links[i]);
	links = document.getElementsByTagName("A");
	for (i = 0; i < links.length; i++)
		SVE_ProtectLink(links[i]);
}

function SVE_ProtectLink(a) {
	if (a.href == null || a.href == "" || startsWith(a.href, "#")) return;
	if (a.sve_checked) return;
	a.sve_checked = true;

	if (a.onclick != null) {
		a.onclick = "alert('This scripted link has been disabled by the Sender Verification Extension.'); return true;";
		return;
	}
	
	var url = Components.classes["@mozilla.org/network/standard-url;1"].createInstance();
	try {
		url.QueryInterface(Components.interfaces.nsIStandardURL).init(1, -1, a.href, null, null);
		url = url.QueryInterface(Components.interfaces.nsIURI).asciiHost;
	} catch (ex) {
		url = null;
	}

	if (url == null || url == "") { 
		alert("Problem with " + a.href);
		return; // probably should disable the link
	}
	
	var oldhref = a.href;
	a.href = "senderverification:Sender Verification is checking this link...";
	
	queryDNS(
		url + ".fraud.rhs.mailpolice.com",
		"A",
		function(addr, a) {
			if (addr == null) {
				a.href = oldhref;
				return;
			}
		
			a.childNodes.item(0).nodeValue = "[FRAUD] " + a.childNodes.item(0).nodeValue + " [FRAUD]";
			a.href = "senderverification:This link was listed in the MailPolice.com block list.";
			
			if (a.ownerDocument.sve_BlockedLink) return;
			a.ownerDocument.sve_BlockedLink = true;
			alert("Sender Verification has blocked one or more links on this page that were listed in the MailPolice.com fraud prevention list.");
		},
		a);
}

function SVE_OnQuerySPFComplete(msgInfo) {	
	var prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch);
	var prefname = "spf.forwarder." + msgInfo.QueryReturn.domain;
	var domainTrusted = (prefs.getPrefType(prefname) == prefs.PREF_STRING && prefs.getCharPref(prefname) == "trust");

	// If it was the envelope address that passed, if that domain is trusted, and if we have
	// further Received: header information, then this is a trusted forwarder.
	if (msgInfo.HeloName2 && msgInfo.IPAddr2 && msgInfo.EnvFrom
		&& msgInfo.QueryReturn.result == "pass"
		&& !endsWith(msgInfo.FromHdr, "@" + msgInfo.QueryReturn.domain)
		&& endsWith(msgInfo.EnvFrom, "@" + msgInfo.QueryReturn.domain)) {
		if (domainTrusted) {
			msgInfo.QueryReturn2 = msgInfo.QueryReturn;
			SVE_QuerySPF(msgInfo.IPAddr2, msgInfo.FromHdr, null, msgInfo, function(msgInfo) {
				msgInfo.QueryReturn.trustedForwarder = msgInfo.QueryReturn2.domain;
				SVE_OnQueriesComplete(msgInfo);
				} );
			return;
		} else {
			msgInfo.QueryReturn.promptToTrust = 1;
		}
	}
	
	SVE_OnQueriesComplete(msgInfo);
}

function SVE_CheckNetcraft(msgInfo) {
	// this isn't used
	
	if (msgInfo.QueryReturn.result == "fail") {
		return;
	}
	
	// Check Netcraft Toolbar
	
	msgInfo.QueryReturn.netcraft_risk = null;
	msgInfo.QueryReturn.netcraft_rank = null;
	msgInfo.QueryReturn.netcraft_since = null;
	
	xmlhttp2.abort();
	xmlhttp2.open("GET", "http://toolbar.netcraft.com/check_url/http://www." + SVE_GetDomain(msgInfo.FromHdr), true);
	xmlhttp2.setRequestHeader("User-Agent", sveHttpUserAgent);
	xmlhttp2.onerror = function() { SVE_DisplayResult(msgInfo); } ;
	xmlhttp2.onload = function() {
		if (xmlhttp2.responseText != null) {
			var matches = xmlhttp2.responseText.match(/>(\d+)</);
			if (matches != null) {
				msgInfo.QueryReturn.netcraft_rank = matches[1];
				if (msgInfo.QueryReturn.netcraft_rank > 2000)
					msgInfo.QueryReturn.netcraft_risk = 1;
				if (msgInfo.QueryReturn.netcraft_rank > 200000)
					msgInfo.QueryReturn.netcraft_risk = 2;
			}

			matches = xmlhttp2.responseText.match(/> ?([A-Z][a-z]+ \d+)</);
			if (matches != null) {
				msgInfo.QueryReturn.netcraft_since = matches[1];
				if (endsWith(msgInfo.QueryReturn.netcraft_since, new Date().getFullYear())
					|| endsWith(msgInfo.QueryReturn.netcraft_since, new Date().getFullYear()-1))
					msgInfo.QueryReturn.netcraft_risk = 2;
			}
		}
		SVE_DisplayResult(msgInfo);
	};
	xmlhttp2.send(null);
}

function SVE_Check_PhishTank(msgInfo) {
	// this isn't used...
	
	if (msgInfo.QueryReturn.result == "fail") {
		return;
	}
	
	var hypothetical_url = "http://www." + SVE_GetDomain(msgInfo.FromHdr);
	
	var rq_ping = getPhishTankRequest( { version: 1, responseformat: 'xml', action: "misc.ping" });
	
	var rq = getPhishTankRequest( { version: 1, responseformat: 'xml', action: "check.url", url: hypothetical_url });
	
	xmlhttp_phishtank.abort();
	xmlhttp_phishtank.open("GET", "https://api.phishtank.com/api/?" + rq, true);
	xmlhttp_phishtank.setRequestHeader("User-Agent", sveHttpUserAgent);
	xmlhttp_phishtank.onerror = function() { SVE_DisplayResult(msgInfo); };
	xmlhttp_phishtank.onload = function() {
		if (xmlhttp_phishtank.responseText != null) {
			alert(xmlhttp_phishtank.responseText);
			// xmlhttp.responseXML
		}
		SVE_DisplayResult(msgInfo);
	};
	xmlhttp_phishtank.send(null);
}

function getPhishTankRequest(params) {
	// pass params in alphabetically
	
	var apikey = "0a1c3a406be4cbbf4ed77c5cea5eef1929f370aca36708aa37acd78dbdac7350";
	var sharedsecret = "411fbcd299cadff00dee86745fc39433e4d1688b7b85327f0e52e951aee35a9a"; // obviously not secure
	
	params["app_key"] = apikey;
	
	// get sorted parameters
	var p = new Array();
	for (var prop in params)
		p.push(prop);
	p.sort();
	
	var url = "";
	var sig = sharedsecret;
	
	for (var i = 0; i < p.length; i++) {
		if (i > 0) url += "&";
		url += p[i];
		url += "=";
		url += params[p[i]];

		sig += p[i];
		sig += params[p[i]];
	}
	
	sig = hex_md5(sig);
	
	url += "&sig=" + sig;
	
	return url;
}

function SVE_Check_OpenPhishingDatabase(msgInfo) {
	// this isn't used ...
	
	if (msgInfo.QueryReturn.result != "pass" && msgInfo.QueryReturn.result != "none") {
		return;
	}
	
	// Check the open phishing database
	
	statusText.childNodes[0].nodeValue = "Checking sender in Open Phishing Database...";

	xmlhttp2.abort();
	xmlhttp2.open("GET", "http://opdb.berlios.de/cgi-bin/query.pl?m=http&i=" + msgInfo.IPAddr + "&s=" + SVE_GetDomain(msgInfo.FromHdr), true);
	xmlhttp2.setRequestHeader("User-Agent", sveHttpUserAgent);
	xmlhttp2.onerror = function() { SVE_DisplayResult(msgInfo); };
	xmlhttp2.onload = function() {
		if (xmlhttp2.responseText != null) {
			var matches = xmlhttp2.responseText.match(/Server: y|IP: y/);
			if (matches != null) {
				msgInfo.QueryReturn.result = "phishing";
				msgInfo.QueryReturn.comment = "This sender is listed in the Open Phishing Database.";
				msgInfo.IsViaMailList = false;
				alert("This mail was sent from an address associated with phishing attacks.  It is recommended that you discard the email immediately.");
			}
		}
		SVE_DisplayResult(msgInfo);
	};
	xmlhttp2.send(null);
}

function SVE_OnQueriesComplete(msgInfo) {
	SVE_DisplayResult(msgInfo);
}

function SVE_DisplayResult(msgInfo) {
	// Store the result of the check into the message properties for later recall.
	if (!msgInfo.QueryReturn.IsFromStorage) {
		/*try {
			var hdr = messenger.msgHdrFromURI(msgInfo.uri);
			hdr.setStringProperty("razor.occams.info/code/spf::status",
					"0\n" +
					new Date() + "\n" +
					msgInfo.QueryReturn.domain + "\n" +
					msgInfo.QueryReturn.result + "\n" +
					msgInfo.QueryReturn.comment);
		} catch (e) {
		}*/
	} else {
		if (msgInfo.QueryReturn.comment != null)
			msgInfo.QueryReturn.comment += " [" + msgInfo.QueryReturn.ComputedDate + "]"
	}

	// Set up the explanation label.
	statusLink.style.display = null;
	if (msgInfo.QueryReturn.comment == "")
		statusLink.childNodes[0].nodeValue = SVE_STRINGS.NO_EXPLANATION;
	else
		statusLink.childNodes[0].nodeValue = msgInfo.QueryReturn.comment;
	
	// When the sender is not verified and the forwarder is not trusted, then
	// show the internal network server link.
	if (msgInfo.QueryReturn.result != "pass" && msgInfo.QueryReturn.result != "phishing" && !msgInfo.QueryReturn.trustedForwarder) {
			
		reverseDNS(msgInfo.IPAddr, function(hostnames) {
			if (hostnames == null || hostnames.length == 0) return;
			statusTrust.style.display = null;
			statusTrust.childNodes[0].nodeValue = SVE_STRINGS.MTACHECK(hostnames[0]);
			statusTrust.linktype = "mta";
			statusTrust.mta = msgInfo.IPAddr;
			statusTrust.reversedns = hostnames[0];
			
			if (recentSenderIps[hostnames[0]] != "ignore" && !sve_internal_mtas_configured) {
				if (recentSenderIps[hostnames[0]] == null) recentSenderIps[hostnames[0]] = 0;
				recentSenderIps[hostnames[0]]++;
				if (recentSenderIps[hostnames[0]] > 5) {
					recentSenderIps[hostnames[0]] = "ignore";
					var spfLinkDiv = document.getElementById('spfLinkDiv');
					if (!spfLinkDiv.style.display) { spfLinkDiv.style.display = 'none'; this.setAttribute('class', 'collapsedHeaderViewButton'); }
					
					window.mta = msgInfo.IPAddr;
					window.reversedns = hostnames[0];
					window.open('chrome://spf/content/trustedmta.xul', '', 'chrome');
				}
			}
		});
	}
	
	// Show the user the result of the query.
	
	if ((msgInfo.QueryReturn.result == "none" || msgInfo.QueryReturn.result == "neutral") && msgInfo.QueryReturn.couldTryDK)
		msgInfo.QueryReturn.result = "neutraltrydk";
	
	if (msgInfo.QueryReturn.result == "fail" && msgInfo.LocalSender)
		msgInfo.QueryReturn.result = "localsender";
	
	if (!msgInfo.IsViaMailList)
	switch (msgInfo.QueryReturn.result) {
		case "pass":
			if (endsWith(msgInfo.FromHdr, "@" + msgInfo.QueryReturn.domain)) {
				statusText.childNodes[0].nodeValue = SVE_STRINGS.CONFIRMED(msgInfo.QueryReturn.domain);
				statusText.style.color = null;
				statusLittleBox.label = SVE_STRINGS.CONFIRMED2;
				statusLittleBox.style.color = "blue";
				
				if (msgInfo.wl_trust != null) {
					statusText.childNodes[0].nodeValue += " -- ";
					statusText.childNodes[0].nodeValue += msgInfo.wl_trust;
					if (msgInfo.dnswl_cat != null)
						statusText.childNodes[0].nodeValue += " (" + msgInfo.dnswl_cat + ")";
					statusLink.childNodes[0].nodeValue += " Reputation information reported by " + msgInfo.wl_trust_mech;
					
				} else if (checkab) {
					statusText.childNodes[0].nodeValue += " (";
					
					var knownstatus = SVE_AddressBookAddressStatus(msgInfo.FromHdr);
					if (knownstatus.addressKnown)
						statusText.childNodes[0].nodeValue += SVE_STRINGS.ADDRESS_KNOWN;
					else if (knownstatus.domainKnown)
						statusText.childNodes[0].nodeValue += SVE_STRINGS.DOMAIN_KNOWN;
					else
						statusText.childNodes[0].nodeValue += SVE_STRINGS.SENDER_UNKNOWN;
					statusText.childNodes[0].nodeValue += " ";
					if (knownstatus.domainKnown)
						statusText.childNodes[0].nodeValue += SVE_STRINGS.USER_NOT_CHECKED(SVE_GetUser(msgInfo.FromHdr));
					else
						statusText.childNodes[0].nodeValue += SVE_STRINGS.DO_YOU_TRUST_DOMAIN;
					
					statusText.childNodes[0].nodeValue += ")";
				} else {
					statusText.childNodes[0].nodeValue += " (" + SVE_STRINGS.CHECK_DOMAIN_CAREFULLY + ")";
				}
			} else {
				statusText.childNodes[0].nodeValue = SVE_STRINGS.ENVELOPE_CONFIRMED(msgInfo.QueryReturn.domain);

				if (checkab) {
					var knownstatus = SVE_AddressBookAddressStatus(msgInfo.EnvFrom);
				
					if (knownstatus.domainKnown) {
						statusText.style.color = "blue";
					} else {
						statusText.style.color = "red";
					}
					
				} else {
					statusText.style.color = "blue";
				}
				
				statusLittleBox.label = SVE_STRINGS.ENVELOPE_CONFIRMED2(msgInfo.QueryReturn.domain);
				statusLittleBox.style.color = statusText.style.color;

				if (msgInfo.QueryReturn.promptToTrust) {
					statusTrust.style.display = null;
					statusTrust.linktype = "forwarder";
					statusTrust.mta = msgInfo.QueryReturn.domain;
					statusTrust.childNodes[0].nodeValue = SVE_STRINGS.FORWARDERCHECK(msgInfo.QueryReturn.domain);
					return;
				}
			}
			
			if (msgInfo.QueryReturn.trustedForwarder)
				statusText.childNodes[0].nodeValue += " " + SVE_STRINGS.VIA(msgInfo.QueryReturn.trustedForwarder);
			break;
		case "fail":
			statusText.childNodes[0].nodeValue = SVE_STRINGS.FORGED(msgInfo.QueryReturn.domain);
			statusText.style.color = "red";
			statusLittleBox.label = SVE_STRINGS.FORGED2;
			statusLittleBox.style.color = "red";
			break;
		case "localsender":
			statusText.childNodes[0].nodeValue = SVE_STRINGS.LOCALSENDER(msgInfo.QueryReturn.domain);
			statusText.style.color = "blue";
			statusLittleBox.label = SVE_STRINGS.NOT_VERIFIED;
			statusLittleBox.style.color = "red";
			break;
		case "none":
		case "neutral":
			switch (msgInfo.QueryReturn.result) {
				case "none": statusText.childNodes[0].nodeValue = SVE_STRINGS.NOT_SUPPORTED; break;
				case "neutral": statusText.childNodes[0].nodeValue = SVE_STRINGS.NEUTRAL; break;
			}
			
			if (checkab) {
				var knownstatus = SVE_AddressBookAddressStatus(msgInfo.FromHdr);
				statusText.childNodes[0].nodeValue += " ";
				if (knownstatus.addressKnown) {
					statusText.childNodes[0].nodeValue += SVE_STRINGS.ADDRESS_KNOWN;
					statusText.style.color = "blue";
				} else if (knownstatus.domainKnown) {
					statusText.childNodes[0].nodeValue += SVE_STRINGS.DOMAIN_KNOWN;
					statusText.style.color = "blue";
				} else {
					statusText.childNodes[0].nodeValue += SVE_STRINGS.SENDER_UNKNOWN;
					statusText.style.color = "red";
				}
			} else {
				statusText.style.color = "blue";
			}
			
			statusLittleBox.label = SVE_STRINGS.NOT_VERIFIED;
			statusLittleBox.style.color = "red";
			break;
		case "neutraltrydk":
			statusText.childNodes[0].nodeValue = SVE_STRINGS.DK_NOT_CHECKED;
			statusLittleBox.label = SVE_STRINGS.NOT_VERIFIED;
			statusLittleBox.style.color = "red";
			break;
		case "phishing":
			statusText.childNodes[0].nodeValue = SVE_STRINGS.ATTACK;
			statusText.style.color = "red";
			statusLink.childNodes[0].nodeValue = msgInfo.QueryReturn.comment;
			statusLittleBox.label = SVE_STRINGS.ATTACK2;
			statusLittleBox.style.color = "red";
			break;
		default:
			statusText.childNodes[0].nodeValue = SVE_STRINGS.ERROR2 + " " + msgInfo.QueryReturn.comment;
			statusText.style.color = "red";
			statusLittleBox.label = SVE_STRINGS.ERROR;
			statusLittleBox.style.color = "red";
			break;
	}

	if (msgInfo.IsViaMailList)
	switch (msgInfo.QueryReturn.result) {
		case "pass":
			statusText.childNodes[0].nodeValue = SVE_STRINGS.MAIL_LIST(msgInfo.QueryReturn.domain);
			statusText.style.color = null;
			statusLink.childNodes[0].nodeValue = SVE_STRINGS.MAIL_LIST_EXPLANATION;
			statusLittleBox.label = SVE_STRINGS.MAIL_LIST2(msgInfo.QueryReturn.domain);
			statusLittleBox.style.color = "blue";
			break;
		default:
			statusText.childNodes[0].nodeValue = SVE_STRINGS.MAIL_LIST_UNVERIFIED;
			statusText.style.color = "blue";
			statusLittleBox.label = SVE_STRINGS.NOT_VERIFIED;
			statusLittleBox.style.color = "red";
			break;
	}
	
	if (warnunverified && msgInfo.QueryReturn.result != "pass") {
		alert(SVE_STRINGS.UNVERIFIED_POPUP_ALERT);
	}
}

function SVE_AddressBookAddressStatus(address) {
	var ret = new Object();
	var addressbook = Components.classes["@mozilla.org/addressbook;1"].createInstance(Components.interfaces.nsIAddressBook);
	var abDatabase = addressbook.getAbDatabaseFromURI("moz-abmdbdirectory://abook.mab");
	var enumerator = abDatabase.enumerateCards(null);
	try {
	  enumerator.first();
	  do {
		 var card = enumerator.currentItem().QueryInterface(Components.interfaces.nsIAbCard);
		 
		 var addys = [card.primaryEmail, card.defaultEmail, card.secondEmail];
		 for (var i = 0; i < addys.length; i++) {
			 if (addys[i].toLowerCase() == address.toLowerCase())
				 ret.addressKnown = true;
			 if (endsWith(addys[i].toLowerCase(), "@" + SVE_GetDomain(address).toLowerCase()))
				 ret.domainKnown = true;
		 }
		 enumerator.next();
	  } while( Components.lastResult == 0 );
	} catch(e) {}
	abDatabase.close(false);
	return ret;
}

function SVE_BeginCheck(msgInfo) {
	SVE_CheckLocalMail(msgInfo);
}

function SVE_CheckLocalMail(msgInfo) {
	// When the user's incoming MTA is the SMTP server that originally accepted the message,
	// then the MTA does not insert a Received: line for itself and the first line indicates the
	// IP address of the sender's own personal computer. As a result, we don't get a line that
	// authorizes the sender. This yields the right message here in most cases because a user
	// who doesn't go through his proper MTA shouldn't be authorized. But when his proper
	// MTA is the user's incoming MTA, then we have an email that looks bad but isn't.
	// What we want to know is: If a sender claims domain D and the user's MTA is a submission
	// server for domain D, and the user's MTA isn't an open relay, then the sender is authorized.
	// However, we can't know all of that. And since we can't know whether the MTA is an open
	// relay (i.e. whether the sender authenticated at that point), the best we can do is turn
	// failures into warnings.
	// So: 
	// If a sender claims domain D and the user's MTA is SPF-permitted by D, then mark this
	// message appropriately for a special warning later.
	
	if (DNS_IsDottedQuad(msgInfo.HeaderObj.folder.server.realHostName))
		SVE_CheckLocalMail2(msgInfo.HeaderObj.folder.server.realHostName, msgInfo);
	else
		queryDNS(msgInfo.HeaderObj.folder.server.realHostName, "A",
			function(dnsresult) {
				if (dnsresult != null)
					SVE_CheckLocalMail2(dnsresult[0], msgInfo);
				else
					SVE_CheckRBLs(msgInfo);
			}
			, null);
}

function SVE_CheckLocalMail2(ipaddr, msgInfo) {
	SPF(ipaddr, SVE_GetDomain(msgInfo.FromHdr),
			function(spfresult) {
				if (spfresult.status == "+") {
					msgInfo.LocalSender = true;
					SVE_CheckSPF(msgInfo); // can skip RBL check if it's own own domain
				} else {
					SVE_CheckRBLs(msgInfo);
				}
			}
		);
}

function SVE_CheckRBLs(msgInfo) {
	if (!checkrbls) {
		SVE_CheckSPF(msgInfo);
		return;
	}
		
	statusText.childNodes[0].nodeValue = SVE_STRINGS.CHECKING_RBLS1;
	statusLittleBox.label = SVE_STRINGS.CHECKING_RBLS2;
	
	SVE_CheckDNSWL(msgInfo);
}

function SVE_CheckSURBL(msgInfo) {
	// Check the SURBL phishing list, which includes (as of 10-2006)
	// MailPolice and PhishTank.
	queryDNS(
		SVE_GetDomain(msgInfo.FromHdr) + ".multi.surbl.org",
		"A",
		function(addr) {
			if (addr == null) {
				SVE_CheckSpamhaus(msgInfo);
			} else {
				SVE_SetStatusFromRBL("SURBL", msgInfo);
				SVE_OnQueriesComplete(msgInfo);
			}
		});
}

function SVE_CheckSpamhaus(msgInfo) {
	// Check Spamhaus's SBL+XBL blacklist.
	queryDNS(
		msgInfo.IPAddr.split('.').reverse().join('.') + ".sbl-xbl.spamhaus.org",
		"A",
		function(addr) {
			if (addr == null) {
				SVE_CheckSPF(msgInfo);
			} else {
				SVE_SetStatusFromRBL("Spamhaus", msgInfo);
				SVE_OnQueriesComplete(msgInfo);
			}
		});
}

function SVE_CheckDNSWL(msgInfo) {
	// Check www.dnswl.org whitelist.
	queryDNS(
		msgInfo.IPAddr.split('.').reverse().join('.') + ".list.dnswl.org",
		"A",
		function(addr) {
			if (addr == null) {
				SVE_CheckSenderScoreCertified(msgInfo);
			} else {
				// It is white-listed, but parse the returned
				// IP address for status.
				
				addr = addr[0];
				ip = addr.split('.');
				
				switch (parseInt(ip[2])) {
				case 2: msgInfo.dnswl_cat = "Financial"; break;
				case 3: msgInfo.dnswl_cat = "Newsletter"; break;
				case 5:
					// This category is for ISPs. But on principle,
					// I don't want to label mail from ISPs as
					// reputable. So we skip WL labeling and go to SPF.
					SVE_CheckSPF(msgInfo);
					return;
					
					msgInfo.dnswl_cat = "ISP";
					break;
				case 7: msgInfo.dnswl_cat = "Travel"; break;
				case 8: msgInfo.dnswl_cat = "Govt/Public"; break;
				case 9: msgInfo.dnswl_cat = "Media/Tech"; break;
				case 11: msgInfo.dnswl_cat = "Educ."; break;
				case 12: msgInfo.dnswl_cat = "Health"; break;
				case 14: msgInfo.dnswl_cat = "Retail"; break;
				}
				
				switch (parseInt(ip[3])) {
				case 0: break; // none
				case 1: break; // low
				case 2: // medium
				case 3: // high
					msgInfo.wl_trust = SVE_STRINGS.REPUTABLE_SENDER;
					msgInfo.wl_trust_mech = "DNSWL.org";
					break;
				}
				
				// Skip other white/blacklists and go on to SPF.
				SVE_CheckSPF(msgInfo);
			}
		});
}

function SVE_CheckSenderScoreCertified(msgInfo) {
	// Check www.bondedsender.org Sender Score Certified whitelist.
	queryDNS(
		msgInfo.IPAddr.split('.').reverse().join('.') + ".query.bondedsender.org",
		"A",
		function(addr) {
			if (addr == null || addr != "127.0.0.10") {
				// Not white-listed, so check the blacklists and then do SPF.
				SVE_CheckSURBL(msgInfo);
			} else {
				// It is white-listed.

				msgInfo.wl_trust = SVE_STRINGS.REPUTABLE_SENDER;
				msgInfo.wl_trust_mech = "Sender Score Certified (bondedsender.org)";
				
				SVE_CheckSPF(msgInfo);
			}
		});
}

function SVE_SetStatusFromRBL(rbl, msgInfo) {
	msgInfo.QueryReturn = new Object();
	msgInfo.QueryReturn.result = "phishing";
	msgInfo.QueryReturn.comment = SVE_STRINGS.BLACKLISTED(rbl);
	msgInfo.QueryReturn.method = "rbl";
	msgInfo.QueryReturn.couldTryDK = 0;
}

function SVE_CheckSPF(msgInfo) {
	SVE_QuerySPF(msgInfo.IPAddr, msgInfo.FromHdr, msgInfo.EnvFrom, msgInfo, function(msgInfo) { SVE_OnQuerySPFComplete(msgInfo) } );
}

function SVE_QuerySPF(ip, from, envfrom, msgInfo, func) {
	if (envfrom != null && envfrom == from)
		envfrom = null;
	
	// Query the email from: first.  If that doesn't pass,
	// then query the email envelope.  If that also doesn't
	// pass, then go with the result of the from: query.
	
	statusText.childNodes[0].nodeValue = SVE_STRINGS.SPF1;
	statusLittleBox.label = SVE_STRINGS.SPF2;
	
	// Remember what message we're looking at now.  If the
	// user moves on to another message while we're waiting
	// for some asynchronous operation to finish, discard
	// the result when the operation finishes.
	var curMessage = GetFirstSelectedMessage();
	var gotInfo = new Object();	
	
	// If no SPF result is available in 5 seconds, this is
	// probably because DNS is taking a long time, or
	// some server is only taking UDP requests.  The user
	// should set his DNS option, if he hasn't already done so.
	var prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch);
	var hasDNSSetting = prefs.getPrefType("dns.nameserver") == prefs.PREF_STRING
		&& prefs.getCharPref("dns.nameserver") != null && prefs.getCharPref("dns.nameserver") != "";
	if (!hasDNSSetting)
	setTimeout(
		function() {
			if (gotInfo.got) return;
			statusText.childNodes[0].nodeValue = SVE_STRINGS.SPF1 + " " + SVE_STRINGS.DNS_TAKING_TIME;
		},
		5000);
	
	SPF(ip, SVE_GetDomain(from),
		function(result) {
			gotInfo.got = true;
			if (curMessage != GetFirstSelectedMessage())
				return;
			
			if (result.status == "+" || envfrom == null)
				SVE_QuerySPF2(result.status, result.message, result.isguess, SVE_GetDomain(from), msgInfo, func);
			else
				SPF(ip, SVE_GetDomain(envfrom),
					function(result2) {
						if (curMessage != GetFirstSelectedMessage())
							return;
						
						if (result2.status == "+")
							SVE_QuerySPF2(result2.status, result2.message, result2.isguess, SVE_GetDomain(envfrom), msgInfo, func);
						else
							SVE_QuerySPF2(result.status, result.message, result.isguess, SVE_GetDomain(from), msgInfo, func);
					});
		});
}

function SVE_QuerySPF2(result, message, isguess, domain, msgInfo, func) {
	// If the SPF test didn't pass, and if there is DK information,
	// then send a query to the query server.
	var couldTryDK = false;
	if (result != "+" && msgInfo.DKHeader != null) {
		if (usedk != "no") {
			if (SVE_TryDK(msgInfo)) return;
		} else {
			couldTryDK = true;
		}
	}
	
	if (result == "+") result = "pass";
	else if (result == "-") result = "fail";
	else if (result == "~") result = "fail";
	else if (result == "?") result = "neutral";
	else if (result == "0") result = "none";
	else result = "error";
	
	msgInfo.QueryReturn = new Object();
	msgInfo.QueryReturn.result = result;
	msgInfo.QueryReturn.comment = message;
	msgInfo.QueryReturn.domain = domain;
	msgInfo.QueryReturn.method = "spf";
	msgInfo.QueryReturn.couldTryDK = couldTryDK;
	func(msgInfo)
}

function SVE_GetDomain(emailaddress) {
	var at = emailaddress.indexOf("@");
	if (at == -1) return null;
	return emailaddress.substr(at+1);
}
function SVE_GetUser(emailaddress) {
	var at = emailaddress.indexOf("@");
	if (at == -1) return null;
	return emailaddress.substr(0, at);
}

function SPFSendDKQuery(helo, ip, email_from, email_envelope, dkheader, dkhash, msgInfo, func) {
	// Prepare the URL of the query.
	
	var url = serverurl;
	url += "?agent=" + useragent;
	url += "&helo=" + helo + "&ip=" + ip;
	
	if (email_from != null)
		url += "&from=" + email_from;

	if (email_envelope != null)
		url += "&envfrom=" + email_envelope;
	
	var url_nodk = url;
	
	if (dkheader != null && dkhash != null) {
		url += "&domainkeys_header=" + dkheader;
		url += "&domainkeys_hash=" + dkhash;
	}
	
	//throw url;
	
	// If the result is cached, use that without going to the server.
	for (var i = 0; i < QueryCache.length; i++) {
		if (QueryCache[i] == null) continue;
		if (QueryCache[i].querystring == url
			|| (QueryCache[i].method == 'spf' && QueryCache[i].querystring_nodk == url_nodk)) {
				
			// If this was an SPF result that doesn't indicate a pass, but there is a DK
			// sigature on this email, then the sig might still pass the email, so don't
			// use the cached result.
			if (QueryCache[i].method == 'spf' && QueryCache[i].result != 'pass' && dkheader != null) continue;
				
			msgInfo.QueryReturn = QueryCache[i];
			func(msgInfo)
			return;
		}
	}
	
	// Build the query object
	var queryObj = new QueryRet(url, url_nodk);
	
	// Query the server.

	var curMessage = GetFirstSelectedMessage();
	
	statusText.childNodes[0].nodeValue = SVE_STRINGS.DK_CONTACTING_SERVER;
	
	xmlhttp.open("GET", url, true);
	xmlhttp.setRequestHeader("User-Agent", sveHttpUserAgent);
	xmlhttp.onerror=function() {
		statusText.childNodes[0].nodeValue = "Error: " + xmlhttp.statusText;
		statusText.style.color = "blue";
		statusLittleBox.label = SVE_STRINGS.ERROR;
	};
	xmlhttp.onload = function() {
		if (GetFirstSelectedMessage() != curMessage) return;
		SPFSendQuery2(msgInfo, func, queryObj);
	};
	xmlhttp.send(null);
}

function SPFSendQuery2(msgInfo, func, queryObj) {	
	// Don't know how better to get the information out of the XML...
	
	if (xmlhttp.responseXML == null) {
		statusText.childNodes[0].nodeValue = SVE_STRINGS.SERVER_ERROR;
		statusText.style.color = "blue";
		statusLittleBox.label = SVE_STRINGS.ERROR;
		return;
	}
	
	var e = xmlhttp.responseXML.documentElement.firstChild;
	while (e && e.nodeName != "response") {
		e = e.nextSibling;
	}
	if (!e) {
		statusText.childNodes[0].nodeValue = SVE_STRINGS.SERVER_ERROR;
		statusText.style.color = "blue";
		statusLittleBox.label = SVE_STRINGS.ERROR;
		return;
	}
	
	e = e.firstChild;
	while (e) {
		if (e.nodeName == "result") { queryObj.result = e.textContent; }
		if (e.nodeName == "comment") { queryObj.comment = e.textContent; }
		if (e.nodeName == "domain") { queryObj.domain = e.textContent; }
		if (e.nodeName == "method") { queryObj.method = e.textContent; }
		
		if (e.nodeName == "change-server") {
			if (confirm("Your current query server requests that you begin using the query server at <" + e.textContent + ">.  The request is most likely to ease the load placed on the current server.  Is this switch okay?")) {
				var prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch);
				prefs.setCharPref("spf.queryserver", e.textContent);
			}
		}
		
		e = e.nextSibling;
	}

	// Return
	msgInfo.QueryReturn = queryObj;
	
	// Cache the return value.
	QueryCache[QueryCacheNext++] = queryObj;
	if (QueryCacheNext == QueryCacheMax) QueryCacheNext = 0;
	
	// Call the callback
	func(msgInfo)
}

function SVE_CheckForLookAlikes(domain) {
	if (domain == "gmail.com" || domain == "yahoo.com" || domain == "aol.com" || domain == "hotmail.com") return; // we know these are good
	
	SVE_CheckForLookAlikesIDN(domain);
	
	var warned = new Object();
	SVE_CheckForLookAlikesMutations(domain, warned);
}

function SVE_CheckForLookAlikesIDN(domain) {
	for (var i = 0; i < domain.length; i++) {
		if (domain.charCodeAt(i) >= 128) {
			SVE_ShowDomainWarning("Warning: The domain of this email <" + domain + "> has extended characters in it that may cause it to have the same appearance as the usual <" + domain + ">, although the domain of this email is different.");
			return;
		}
	}
}

function SVE_CheckForLookAlikesMutations(domain, warned) {
	var nc;
	for (var i = 0; i < domain.length; i++) {
		if (domain.charAt(i) == "i" || domain.charAt(i) == "I") {
			SVE_CheckForLookAlikesMutations2(domain, i, "l", warned);
			//SVE_CheckForLookAlikesMutations2(domain, i, "1", warned);
		}
		if (domain.charAt(i) == "l" || domain.charAt(i) == "L") {
			SVE_CheckForLookAlikesMutations2(domain, i, "i", warned);
			//SVE_CheckForLookAlikesMutations2(domain, i, "1", warned);
		}
		if (domain.charAt(i) == "1") {
			SVE_CheckForLookAlikesMutations2(domain, i, "i", warned);
			SVE_CheckForLookAlikesMutations2(domain, i, "l", warned);
		}
		if (domain.charAt(i) == "o") {
			//SVE_CheckForLookAlikesMutations2(domain, i, "0", warned);
		}
		if (domain.charAt(i) == "0") {
			SVE_CheckForLookAlikesMutations2(domain, i, "o", warned);
		}
	}
}
function SVE_CheckForLookAlikesMutations2(domain, i, c, warned) {
	var dom2 = domain.substr(0, i) + c + domain.substr(i+1);
	queryDNS(dom2, "A",
		function(resolved) {
			if (resolved == null || resolved.length == 0) return;
			if (warned.warned) return;
			warned.warned = true;
			SVE_ShowDomainWarning("Warning: The domain of this email <" + domain + "> is similar to the domain <" + dom2 + ">.");
		});
}

function SVE_ShowDomainWarning(warning) {
	var spfDomainWarning = document.getElementById("spfDomainWarning");
	spfDomainWarning.style.display = null;
	spfDomainWarning.value = warning;
}

function DumpDOM(indent, element) {
	if (element == null) { element = indent; indent = ""; }
	var consoleService = Components.classes["@mozilla.org/consoleservice;1"].getService(Components.interfaces.nsIConsoleService);
	consoleService.logStringMessage(indent + element.nodeName + " id=" + element.id);
	for (var i = 0; i < element.childNodes.length; i++) {
		DumpDOM(indent + "  ", element.childNodes.item(i));		
	}
}

function QueryRet(querystring, querystring_nodk) {
	this.querystring = querystring;
	this.querystring_nodk = querystring_nodk;
}

function MyUrlListener() {
	this.OnStartRunningUrl = function(url) { alert("Start" + url); }
	this.OnStopRunningUrl = function(url, status) { alert("Stop " + staus + ": " + url); }
}

function startsWith(a, b) {
	if (a == null || b == null) return false;
	if (b.length > a.length) return false;
	return a.substring(0, b.length) == b;
}
function endsWith(a, b) {
	if (a == null || b == null) return false;
	if (b.length > a.length) return false;
	return a.substring(a.length-b.length) == b;
}

function SVE_Debug(message) {
	var consoleService = Components.classes["@mozilla.org/consoleservice;1"].getService(Components.interfaces.nsIConsoleService);
	consoleService.logStringMessage(message);
}


