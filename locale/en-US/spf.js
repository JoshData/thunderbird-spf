var SPF_STRINGS = new Object();
SPF_STRINGS.NOT_SUPPORTED = "Domain does not support SPF verification.";
SPF_STRINGS.ERROR = function(queryError) { return "Could not get SPF info: " + queryError; };
SPF_STRINGS.DNS_EXCEEDED = "SPF check exceeded maximum number of DNS queries.";
SPF_STRINGS.PASS = function(domain, isguess) { return "The sender was " + (!isguess ? "explicitly" : "implicitly") + " permitted by <" + domain + "> with SPF."; };
SPF_STRINGS.FAIL = function(domain) { return "The sender was denied by <" + domain + "> by SPF."; }
SPF_STRINGS.SOFTFAIL = function(domain) { return "The sender was not permitted by <" + domain + "> with SPF."; };
SPF_STRINGS.UNKNOWN = function(domain) { return "The sender could not be verified by <" + domain + "> using SPF."; };
SPF_STRINGS.PERMERROR = "The sender has a SPF configuration problem or uses an unsupported feature.";
SPF_STRINGS.TEMPERROR = "There was a temporary problem using SPF verification.";
SPF_STRINGS.NOT_SUPPORTED = function(domain) { return "Domain <" + domain + "> does not support SPF verification."; };

