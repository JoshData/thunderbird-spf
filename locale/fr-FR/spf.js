var SPF_STRINGS = new Object();
SPF_STRINGS.NOT_SUPPORTED = "Ce Domaine ne gère pas la vérification SPF.";
SPF_STRINGS.ERROR = function(queryError) { return "n'a pas réussi à obtenir l'information SPF: " + queryError; };
SPF_STRINGS.DNS_EXCEEDED = "La vérification SPF a dépassée le nombre maximum de requêtes DNS.";
SPF_STRINGS.PASS = function(domain, isguess) { return "L'expéditeur a été " + (!isguess ? "explicitement" : "implicitement") + " autorisé par <" + domain + ">  utilisant SPF."; };
SPF_STRINGS.FAIL = function(domain) { return "L'expéditeur a été nié par <" + domain + "> utilisant SPF."; }
SPF_STRINGS.SOFTFAIL = function(domain) { return "L'expéditeur n'a pas été autorisé par <" + domain + "> en utilisant SPF."; };
SPF_STRINGS.UNKNOWN = function(domain) { return "L'expéditeur n'a pas pu être autentifié par <" + domain + "> utilisant SPF."; };
SPF_STRINGS.PERMERROR = "L'expéditeur rencontre un problème de configuration SPF ou utilise une fonction non définie.";
SPF_STRINGS.TEMPERROR = "La vérification SPF a rencontré un problème momentané.";
SPF_STRINGS.NOT_SUPPORTED = function(domain) { return "Le Domaine  <" + domain + "> ne gère pas la vérification SPF"; };

