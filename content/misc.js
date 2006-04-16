var prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch);

function doAddList(name, prefname, prefprefix) {
	var re = new RegExp(',', 'g');
	var name = name.replace(re, '');
	if (name == "") { return; }
	
	var list = "";
	if (prefs.getPrefType(prefname) == prefs.PREF_STRING) {
		list = prefs.getCharPref(prefname);
	}
	if (list == "") {
		list = name;
	} else {
		list = list + "," + name;
	}
	
	prefs.setCharPref(prefname, list);
}

