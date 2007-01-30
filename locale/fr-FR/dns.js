var DNS_STRINGS = new Object();
DNS_STRINGS.TOO_MANY_HOPS = "Nombre de sauts 'HOP' trop important.";
DNS_STRINGS.CONNECTION_REFUSED = function(server) { return "Le Serveur DNS " + server + " a refusé la connection TCP."; };
DNS_STRINGS.TIMED_OUT = function(server) { return "Le Serveur DNS " + server + " a dépassé le délai sur la connection TCP."; };
DNS_STRINGS.SERVER_ERROR = function(server) { return "Erreur de connection sur le serveur DNS " + server + "."; };
DNS_STRINGS.INCOMPLETE_RESPONSE = function(server) { return "Réponse incomplète du serveur " + server + "."; };

