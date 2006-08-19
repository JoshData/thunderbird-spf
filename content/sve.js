/*
 * MOZILLA THUNDERBIRD EXTENSION FOR SENDER VERIFICATION
 *
 * Copyright 2004-2005 Joshua Tauberer <tauberer@for.net>
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
var sveHttpUserAgent = "Sender Verification Extension for Mozilla Thunderbird 0.79";

// REGULAR EXPRESSIONS

var ReturnPathRegEx = /^Return-Path: <([^>]+)>/;
var ReceivedRegEx = /^Received: from ([\w\W]+) \([\w\W]*\[([\d\.]+)\]/; // The sendmail-style Received: header.
var ReceivedRegEx2 = /^Received: from \[([\d\.]+)\] \([\w\W]*helo=([^)]+)\)/; // An apparently Exim-style header: Received: from [65.54.185.19] (...helo=hotmail.com)
var ReceivedRegEx3 = /^Received: from ([\w\.\-\_]+) \(([\d\.]+)\)/; // Yet another format
var ReceivedRegEx4 = /^Received: from [\w\W]+\((EHLO|HELO) ([^)]+)\) \(([\d\.]+)\)/; // Yet another format
var ReceivedRegEx5 = /^Received: from \s*\[([\d\.]+)\] [\w\W]*\(EHLO ([^)]+)\)/; // ArGoSoft Mail Server Pro
var FromRegEx = /^From: [^<]*<([^>]+)>|^From: ([\w\d\._\-]+@[\w\d\.\_\-]+)/i;	
var DateRegEx = /^Date: ([\w\W]+)/i;

// MISC

var xmlhttp = new XMLHttpRequest();
var xmlhttp2 = new XMLHttpRequest();

var DAYS_TOO_OLD = 7; // THIS MANY DAYS IN THE PAST => NO SPF CHECK
var DAYS_IN_THE_FUTURE = 1.1; // THIS MANY DAYS IN THE FUTURE => NO SPF CHECK

// PREFERENCES

var serverurl = "";
var checkonload = "";
var usedk = "";
var warnunverified;
var onlystatusbar;
var sve_internal_mtas;

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

var IsViaMailList = null;

var DKHeader = null;
var DKHeaderPostPosition = null;
var DKHash = null;

var QueryReturn = null;
var QueryReturn2 = null;

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

function spfLoadSettings() {
	var prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch);

	serverurl = "http://taubz.for.net/code/spf/cgi-bin/query.cgi";
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
	
	sve_internal_mtas = Array(0);
	if (prefs.getPrefType("spf.internal_mtas") == prefs.PREF_STRING)
		sve_internal_mtas = prefs.getCharPref("spf.internal_mtas").split(',');
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
		statusText.value = "Click on Verify Sender (SPF/DK) from the Tools menu."; // not visible...
		return;
	}

	if (!onlystatusbar)
		spfBox.style.display = null;
	else
		statusLittleBox.style.display = null;
	
	// Check that a query server has been set up.  If not, display an error.
	
	if (!serverurl) {
		statusText.value = "No verification server has been configured.";
		return;
	}
	
	// Load the message service, and scan the message headers.

	statusText.value = "Scanning message headers...";
	statusLittleBox.label = "SVE: Scanning...";
	
	FromHdr = null;
	EnvFrom = null;
	DateHdr = null;
	
	HeloName = null;
	IPAddr = null;
	
	HeloName2 = null;
	IPAddr2 = null;
	
	IsViaMailList = false;
	
	DKHeader = null;
	DKHash = null;
	
    var msgService = messenger.messageServiceFromURI(uri);
	var prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch);
	
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
						DKHeader += this.h;
						DKHeaderPostPosition = this.bytesread;
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
				if (m) { EnvFrom = m[1].toLowerCase(); }
				
				// TODO: What if the From address is split onto two lines.....
				m = FromRegEx.exec(this.h);
				if (m) {
					FromHdr = m[1];
					if (!FromHdr) { FromHdr = m[2]; }
					FromHdr = FromHdr.toLowerCase();
				}
				
				m = DateRegEx.exec(this.h);
				if (m) { DateHdr = Date.parse(m[1]); }
				
				var he = null;
				var ip = null;
				
				m = ReceivedRegEx.exec(this.h);
				if (m) { he = m[1]; ip = m[2]; }
				
				m = ReceivedRegEx2.exec(this.h);
				if (m) { ip = m[1]; he = m[2]; }
					
				m = ReceivedRegEx3.exec(this.h);
				if (m) { he = m[1]; ip = m[2]; }
		
				m = ReceivedRegEx4.exec(this.h);
				if (m) { he = m[2]; ip = m[3]; }

				m = ReceivedRegEx5.exec(this.h);
				if (m) { ip = m[1]; he = m[2]; }

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
							HeloName = he;
							IPAddr = ip;
						} else if (this.mode == 1) {
							// This gets the second matching Received: line information.
							HeloName2 = he;
							IPAddr2 = ip;
						}						
						this.mode++;
					}
				}
			
				if (startsWith(this.h, "DomainKey-Signature: ") && DKHeader == null) {
					// DKHeader != null to make sure we only read the first DK header in the message.
					DKHeader = this.h.substring(21, this.h.length);
					this.hlast = "DK";
					DKHeaderPostPosition = this.bytesread; // message hash starts from this position
				}
				
				if (startsWith(this.h, "List-Id: ")) {
					IsViaMailList = true;
				}
		
				this.h = "";
				this.hcont = false;
			}
			
			if (endofheaders) {
				spfGo1();
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
		statusText.value = "Sender verification is not applicable for this message.";
		statusLittleBox.label = "SVE: Not Applicable";
		return;
	}
	
}

function spfGo1() {
	if (IsViaMailList) {
		// If this is a mail list email, don't bother trying to check the FromAddress
		// since SPF will certainly fail, and DK will probably fail since messages
		// are usually appended with a mail list footer.
		FromHdr = EnvFrom;
	}
	
	if (FromHdr != null && SVE_GetDomain(FromHdr) == null) FromHdr = null;
	if (EnvFrom != null && SVE_GetDomain(EnvFrom) == null) EnvFrom = null;
	
	// What if there is no From: header
	if (!FromHdr) {
		statusText.value = "Cannot determine sender address from mail message.";
		statusText.style.color = "blue";
		statusLittleBox.label = "SVE: Not Applicable";
		return;
	}
	
	// If the message does not have a parseable date, flag an error.
	/*if (!DateHdr) {
		statusText.value = "Message date could not be determined.";
		return;
	}*/
	
	// If the message is old, there's no way to know whether something legitimate now
	// was legitimate when it was sent, or something illegitimate now might have
	// (confusingly) been legitimate at the time.
	if (DateHdr != null && new Date().getTime() - DateHdr > 1000*60*60*24*DAYS_TOO_OLD) {
		statusText.value = "Message is too old to verify sender.";
		statusLittleBox.label = "SVE: Not Applicable";
		return;
	}
	
	// For completeness, if a message was sent too far in the future, flag a problem.
	if (DateHdr != null && DateHdr - new Date().getTime() > 1000*60*60*24*DAYS_IN_THE_FUTURE) {
		statusText.value = "Message date is in the future.  Sender verification skipped.";
		statusLittleBox.label = "SVE: Not Applicable";
		return;
	}
	
	// When there aren't any matching Recevied: headers, the mail probably started
	// on the mail server itself.  Is this a security problem?
	if (!HeloName || !IPAddr) {
		statusText.value = "Mail originates from your mail server, or message headers could not be understood.";
		statusLittleBox.label = "SVE: Not Applicable";
		return;
	}

	SVE_QuerySPF(HeloName, IPAddr,
		FromHdr, EnvFrom != null && EnvFrom != FromHdr ? EnvFrom : null,
		"spfGo2()");
	
	// Protect all links.  This was an interesting idea, but it's disabled for now.
	// SVE_ProtectLinks(document.getElementById("messagepane").contentDocument);
	
}

function SVE_TryDK() {
	var csi;
	var mode;
	var h;
	var c;
	
	// Interpret the DK header
	if (FromHdr != null && DKHeader != null && DKHeader != "") {
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
		
		for (csi = 0; csi < DKHeader.length; csi++) {
			c = DKHeader.charAt(csi);
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
						case "d": DK_DOMAIN = v.toLowerCase(); break;
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
		if (DK_SIG != null && (DK_CAN == "simple" || DK_CAN == "nofws") && DK_DOMAIN != null && DK_QMETHOD != null && DK_SELECTOR != null) {
			statusText.value = "Computing DomainKeys signature...";
			statusLittleBox.label = "SVE: Checking DK...";
	
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
					
					DKHash = sha1_incremental_end_base64();
					
					SPFSendDKQuery(HeloName, IPAddr, FromHdr, EnvFrom != null && EnvFrom != FromHdr ? EnvFrom : null, DKHeader, DKHash, "spfGoFinish()");
				},
				
				onDataAvailable: function(request, context, inputStream, offset, count) {
					if (this.stream == null) {
						this.stream = Components.classes["@mozilla.org/binaryinputstream;1"]
						  .createInstance(Components.interfaces.nsIBinaryInputStream);
						this.stream.setInputStream(inputStream);
					}
					
					while (this.bytesread < DKHeaderPostPosition && count > 0) {
						this.bytesread++;
						count--;
						this.stream.read8();
					}
					if (count == 0) return;
					
					if (this.bytesread > 20000) {
						this.bytesread = 0;
						statusText.value = "DomainKeys verification will take too long.  Cannot verify sender.";
						statusLittleBox.label = "SVE: DK Aborted";
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
				statusText.value = ex;
				statusLittleBox.label = "SVE: Error";
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

function spfGo2() {	
	var prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch);
	var prefname = "spf.forwarder." + QueryReturn.domain;
	var domainTrusted = (prefs.getPrefType(prefname) == prefs.PREF_STRING && prefs.getCharPref(prefname) == "trust");

	// If it was the envelope address that passed, if that domain is trusted, and if we have
	// further Received: header information, then this is a trusted forwarder.
	if (HeloName2 && IPAddr2 && EnvFrom
		&& QueryReturn.result == "pass"
		&& !endsWith(FromHdr, "@" + QueryReturn.domain)
		&& endsWith(EnvFrom, "@" + QueryReturn.domain)) {
		if (domainTrusted) {
			QueryReturn2 = QueryReturn;
			SVE_QuerySPF(HeloName2, IPAddr2, FromHdr, null, "spfGo3()");
			return;
		} else {
			QueryReturn.promptToTrust = 1;
		}
	}
	
	spfGoFinish();
}

function spfGo3() {
	QueryReturn.trustedForwarder = QueryReturn2.domain;
	spfGoFinish();
}

function spfGoFinish_netcraft_disabled() {
	if (QueryReturn.result == "fail") {
		spfGoFinish2();
		return;
	}
	
	// Check Netcraft Toolbar
	
	QueryReturn.netcraft_risk = null;
	QueryReturn.netcraft_rank = null;
	QueryReturn.netcraft_since = null;
	
	xmlhttp2.abort();
	xmlhttp2.open("GET", "http://toolbar.netcraft.com/check_url/http://www." + SVE_GetDomain(FromHdr), true);
	xmlhttp2.setRequestHeader("User-Agent", sveHttpUserAgent);
	xmlhttp2.onerror = spfGoFinish2;
	xmlhttp2.onload = function() {
		if (xmlhttp2.responseText != null) {
			var matches = xmlhttp2.responseText.match(/>(\d+)</);
			if (matches != null) {
				QueryReturn.netcraft_rank = matches[1];
				if (QueryReturn.netcraft_rank > 2000)
					QueryReturn.netcraft_risk = 1;
				if (QueryReturn.netcraft_rank > 200000)
					QueryReturn.netcraft_risk = 2;
			}

			matches = xmlhttp2.responseText.match(/> ?([A-Z][a-z]+ \d+)</);
			if (matches != null) {
				QueryReturn.netcraft_since = matches[1];
				if (endsWith(QueryReturn.netcraft_since, new Date().getFullYear())
					|| endsWith(QueryReturn.netcraft_since, new Date().getFullYear()-1))
					QueryReturn.netcraft_risk = 2;
			}
		}
		spfGoFinish2();
	};
	xmlhttp2.send(null);
}

function spfGoFinish() {
	if (QueryReturn.result != "pass" && QueryReturn.result != "none") {
		spfGoFinish2();
		return;
	}
	
	// Check the open phishing database
	
	statusText.value = "Checking sender in Open Phishing Database...";

	xmlhttp2.abort();
	xmlhttp2.open("GET", "http://opdb.berlios.de/cgi-bin/query.pl?m=http&i=" + IPAddr + "&s=" + SVE_GetDomain(FromHdr), true);
	xmlhttp2.setRequestHeader("User-Agent", sveHttpUserAgent);
	xmlhttp2.onerror = spfGoFinish2;
	xmlhttp2.onload = function() {
		if (xmlhttp2.responseText != null) {
			var matches = xmlhttp2.responseText.match(/Server: y|IP: y/);
			if (matches != null) {
				QueryReturn.result = "phishing";
				QueryReturn.comment = "This sender is listed in the Open Phishing Database.";
				IsViaMailList = false;
				alert("This mail was sent from an address associated with phishing attacks.  It is recommended that you discard the email immediately.");
			}
		}
		spfGoFinish2();
	};
	xmlhttp2.send(null);
}

function spfGoFinish2() {
	// Check for similarly-named domains.  There's no sense in doing this if
	// the domain is already apparently forged.	
	/*if (QueryReturn.result != "fail")
		SVE_CheckForLookAlikes(SVE_GetDomain(FromHdr));*/
	
	// Set up the explanation label.
	statusLink.style.display = null;
	if (QueryReturn.comment == "")
		statusLink.value = "No explanation is available for this message.";
	else
		statusLink.value = QueryReturn.comment;
	
	/*if (QueryReturn.netcraft_risk > 0)
		statusLink.value += " Site Age: " + QueryReturn.netcraft_since + ", Netcraft Rank: " + QueryReturn.netcraft_rank;*/

	// When the sender is not verified and the forwarder is not trusted, then
	// show the internal network server link.
	if (QueryReturn.result != "pass" && QueryReturn.method != "surbl" && !QueryReturn.trustedForwarder) {
			
		reverseDNS(IPAddr, function(hostnames) {
			if (hostnames == null || hostnames.length == 0) return;
			statusTrust.style.display = null;
			statusTrust.childNodes[0].nodeValue = "Sender was " + hostnames[0] + ". Is that in your network?";
			statusTrust.linktype = "mta";
			statusTrust.mta = IPAddr;
			statusTrust.reversedns = hostnames[0];
			
			if (recentSenderIps[hostnames[0]] != "ignore") {
				if (recentSenderIps[hostnames[0]] == null) recentSenderIps[hostnames[0]] = 0;
				recentSenderIps[hostnames[0]]++;
				if (recentSenderIps[hostnames[0]] > 5) {
					recentSenderIps[hostnames[0]] = "ignore";
					var spfLinkDiv = document.getElementById('spfLinkDiv');
					if (!spfLinkDiv.style.display) { spfLinkDiv.style.display = 'none'; this.setAttribute('class', 'collapsedHeaderViewButton'); }
					
					window.mta = IPAddr;
					window.reversedns = hostnames[0];
					window.open('chrome://spf/content/trustedmta.xul', '', 'chrome');
				}
			}
		});
	}
	
	// Show the user the result of the query.
	
	if ((QueryReturn.result == "none" || QueryReturn.result == "neutral") && QueryReturn.couldTryDK)
		QueryReturn.result = "neutraltrydk";
	
	if (!IsViaMailList)
	switch (QueryReturn.result) {
		case "pass":
			if (endsWith(FromHdr, "@" + QueryReturn.domain)) {
				statusText.value = "Sending Domain <" + QueryReturn.domain + "> Verified";
				statusText.style.color = null;
				statusLittleBox.label = "SVE: Domain Verified";
				statusLittleBox.style.color = "blue";
			} else {
				statusText.value = "\"From\" address could not be verified. Verified envelope domain: <" + QueryReturn.domain + ">";
				statusText.style.color = "red";
				statusLittleBox.label = "SVE: Real Domain: " + QueryReturn.domain;
				statusLittleBox.style.color = "red";

				if (QueryReturn.promptToTrust) {
					statusTrust.style.display = null;
					statusTrust.linktype = "forwarder";
					statusTrust.mta = QueryReturn.domain;
					statusTrust.childNodes[0].nodeValue = "Is " + QueryReturn.domain + " a mail list?";
					return;
				}
			}
			
			if (QueryReturn.trustedForwarder)
				statusText.value += " (via " + QueryReturn.trustedForwarder + ")";
			if (QueryReturn.method == "spf")
				statusText.value += " [SPF]";
			if (QueryReturn.method == "dk")
				statusText.value += " [DomainKeys]";
			break;
		case "fail":
			statusText.value = "This does not appear to be a legitimate <" + QueryReturn.domain + "> email.";
			statusText.style.color = "red";
			statusLittleBox.label = "SVE: Verification Failed";
			statusLittleBox.style.color = "red";
			break;
		case "none":
			statusText.value = "Sending domain does not support verification.  (Address could be forged.)";
			statusText.style.color = "blue";
			statusLittleBox.label = "SVE: Not Verified";
			statusLittleBox.style.color = "red";
			break;
		case "neutral":
			statusText.value = "Sender cannot be verified by domain.  (Address could be forged.)";
			statusText.style.color = "blue";
			statusLittleBox.label = "SVE: Not Verified";
			statusLittleBox.style.color = "red";
			break;
		case "neutraltrydk":
			statusText.value = "DomainKeys not checked; address could be forged. (Enable DomainKeys in Tools->Extension->Options)";
			statusLittleBox.label = "SVE: Not Verified";
			statusLittleBox.style.color = "red";
			break;
		case "phishing":
			statusText.value = "This sender is a known malicious phisher.  Discard this email.";
			statusText.style.color = "red";
			statusLink.value = QueryReturn.comment;
			statusLittleBox.label = "SVE: Phishing Attack";
			statusLittleBox.style.color = "red";
			break;
		default:
			statusText.value = "Error: " + QueryReturn.comment;
			statusText.style.color = "red";
			statusLittleBox.label = "SVE: Error";
			statusLittleBox.style.color = "red";
			break;
	}

	if (IsViaMailList)
	switch (QueryReturn.result) {
		case "pass":
			statusText.value = "Message is verified from a <" + QueryReturn.domain + "> mail list.";
			statusText.style.color = null;
			statusLink.value = "The original sender of mail-list email cannot be verified.";
			statusLittleBox.label = "SVE: Mail List Verified: " + QueryReturn.domain;
			statusLittleBox.style.color = "blue";
			break;
		default:
			statusText.value = "Mail list domain could not be verified or does not support verification.";
			statusText.style.color = "blue";
			statusLittleBox.label = "SVE: Not Verified";
			statusLittleBox.style.color = "red";
			break;
	}
	
	if (warnunverified && QueryReturn.result != "pass") {
		alert("The sending domain of this email could not be verified.  It is advised that you do not reply to this email, download any attachments, or follow any links in the email.\n\nThis warning can be turned off by going to the Sender Verification Exception options window, which can be found in Tools -> Extensions.");
	}
}

function SVE_QuerySPF(helo, ip, email_from, email_envelope, func) {
	// Query the email from: first.  If that doesn't pass,
	// then query the email envelope.  If that also doesn't
	// pass, then go with the result of the from: query.
	
	statusText.value = "Performing SPF verification...";
	statusLittleBox.label = "SVE: Checking SPF...";
	
	// Check mailpolice's fraud list.
	queryDNS(
		SVE_GetDomain(email_from) + ".fraud.rhs.mailpolice.com",
		"A",
		function(addr) {
			if (addr != null)
				alert("The domain <" + SVE_GetDomain(email_from) + "> is listed in the MailPolice fraud blocklist.  It is likely this message was written with malicious intentions.  It is advised that you do not reply or open any links in the email.");
		});
	
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
			statusText.value = "Performing SPF verification...  [Try setting DNS server in options.]";
		},
		5000);
	
	SPF(ip, SVE_GetDomain(email_from),
		function(result) {
			gotInfo.got = true;
			SVE_Debug("SVE SPF: " + ip + " " + email_from + " => " + result.status + " (" + result.message + ")"); 
			
			if (curMessage != GetFirstSelectedMessage())
				return;
			
			if (result.status == "+" || email_envelope == null)
				SVE_QuerySPF2(result.status, result.message, result.isguess, SVE_GetDomain(email_from), helo, ip, email_from, email_envelope, func);
			else
				SPF(ip, SVE_GetDomain(email_envelope),
					function(result2) {
						if (curMessage != GetFirstSelectedMessage())
							return;
						
						SVE_Debug("SVE SPF: " + ip + " " + email_envelope + " => " + result2.status + " (" + result2.message + ")");
						if (result2.status == "+")
							SVE_QuerySPF2(result2.status, result2.message, result2.isguess, SVE_GetDomain(email_envelope), helo, ip, email_from, email_envelope, func);
						else
							SVE_QuerySPF2(result.status, result.message, result.isguess, SVE_GetDomain(email_from), helo, ip, email_from, email_envelope, func);
					});
		});
}

function SVE_QuerySPF2(result, message, isguess, domain, helo, ip, email_from, email_envelope, func) {
	// If the SPF test didn't pass, and if there is DK information,
	// then send a query to the query server.
	var couldTryDK = false;
	if (result != "+" && DKHeader != null) {
		if (usedk != "no") {
			if (SVE_TryDK()) return;
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
	
	QueryReturn = new Object();
	QueryReturn.result = result;
	QueryReturn.comment = message;
	QueryReturn.domain = domain;
	QueryReturn.method = "spf";
	QueryReturn.couldTryDK = couldTryDK;
	setTimeout(func, 1);
}

function SVE_GetDomain(emailaddress) {
	var at = emailaddress.indexOf("@");
	if (at == -1) return null;
	return emailaddress.substr(at+1);
}

function SPFSendDKQuery(helo, ip, email_from, email_envelope, dkheader, dkhash, func) {
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
				
			QueryReturn = QueryCache[i];
			window.setTimeout(func, 1);
			return;
		}
	}
	
	// Build the query object
	var queryObj = new QueryRet(url, url_nodk);
	
	// Query the server.

	var curMessage = GetFirstSelectedMessage();
	
	statusText.value = "Contacting DomainKeys verification server...";
	
	xmlhttp.open("GET", url, true);
	xmlhttp.setRequestHeader("User-Agent", sveHttpUserAgent);
	xmlhttp.onerror=function() {
		statusText.value = "Error verifying sender: " + xmlhttp.statusText;
		statusText.style.color = "blue";
		statusLittleBox.label = "SVE: Error";
	};
	xmlhttp.onload = function() {
		if (GetFirstSelectedMessage() != curMessage) return;
		SPFSendQuery2(func, queryObj);
	};
	xmlhttp.send(null);
}

function SPFSendQuery2(func, queryObj) {	
	// Don't know how better to get the information out of the XML...
	
	if (xmlhttp.responseXML == null) {
		statusText.value = "There was a server error.";
		statusText.style.color = "blue";
		statusLittleBox.label = "SVE: Error";
		return;
	}
	
	var e = xmlhttp.responseXML.documentElement.firstChild;
	while (e && e.nodeName != "response") {
		e = e.nextSibling;
	}
	if (!e) {
		statusText.value = "Server error.";
		statusText.style.color = "blue";
		statusLittleBox.label = "SVE: Error";
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
	QueryReturn = queryObj;
	
	// Cache the return value.
	QueryCache[QueryCacheNext++] = queryObj;
	if (QueryCacheNext == QueryCacheMax) QueryCacheNext = 0;
	
	// Call the callback
	window.setTimeout(func, 1);
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

