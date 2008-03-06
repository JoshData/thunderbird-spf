var SPF_STRINGS = new Object();
SPF_STRINGS.NOT_SUPPORTED = "El dominio no soporta la verificación SPF.";
SPF_STRINGS.ERROR = function(queryError) { return "No se pudo obtener la información SPF: " + queryError; };
SPF_STRINGS.DNS_EXCEEDED = "Máximo número de comprobaciones SPF superadas en el DNS.";
SPF_STRINGS.PASS = function(domain, isguess) { return "El remitente fue permitido " + (!isguess ? "explícitamente" : "implícitamente") + " por <" + domain + "> con SPF."; };
SPF_STRINGS.FAIL = function(domain) { return "El remitente fue denegado por <" + domain + "> por SPF."; }
SPF_STRINGS.SOFTFAIL = function(domain) { return "El remitente no fue permitido por <" + domain + "> con SPF."; };
SPF_STRINGS.UNKNOWN = function(domain) { return "El remitente podría no ser verificado por <" + domain + "> usando SPF."; };
SPF_STRINGS.PERMERROR = "El remitente tiene un problema de configuración de SPF u usa una función no permitida.";
SPF_STRINGS.TEMPERROR = "Hubo un error temporal usando la verificación SPF.";
SPF_STRINGS.NOT_SUPPORTED = function(domain) { return "El dominio <" + domain + "> no soporta la verificación SPF."; };

