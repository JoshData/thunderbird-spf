var DNS_STRINGS = new Object();
DNS_STRINGS.TOO_MANY_HOPS = "Demasiados hops.";
DNS_STRINGS.CONNECTION_REFUSED = function(server) { return "El servidor DNS " + server + " rechazó la conexión TCP."; };
DNS_STRINGS.TIMED_OUT = function(server) { return "El servidor DNS " + server + " finalizó por tiempo la conexión TCP."; };
DNS_STRINGS.SERVER_ERROR = function(server) { return "Error al conectar al servidor de DNS " + server + "."; };
DNS_STRINGS.INCOMPLETE_RESPONSE = function(server) { return "Respuesta incompleta desde " + server + "."; };

