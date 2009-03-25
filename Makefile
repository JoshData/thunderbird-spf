JARSOURCES=\
	content/contents.rdf \
	content/md5.js content/sha1.js content/dns.js content/spf.js content/domainkeys.js content/sve.js  \
	content/BigInt.js content/Barrett.js content/RSA.js \
	content/spf.xul content/options.xul content/statusoverlay.xul \
	content/misc.js content/trustedmta.xul content/trustedforwarder.xul \
	locale/*/*

XPISOURCES=\
	install.rdf \
	chrome.manifest \
	chrome/sve.jar
	
all: sve.xpi package

sve.xpi: $(XPISOURCES)
	zip -q sve.xpi $(XPISOURCES)

chrome/sve.jar: $(JARSOURCES)
	mkdir -p chrome
	zip -q chrome/sve.jar $(JARSOURCES)

package: sve.xpi
	mkdir -p archive
	tar -C .. -czf archive/thunderbird-sve-`date +%F`.tgz \
		 --exclude thunderbird-spf/content/.svn \
		thunderbird-spf/chrome \
		thunderbird-spf/content \
		thunderbird-spf/locale \
		thunderbird-spf/install.rdf \
		thunderbird-spf/chrome.manifest \
		thunderbird-spf/Makefile \
		thunderbird-spf/query.cgi \
		thunderbird-spf/README \
		thunderbird-spf/sve.xpi
	ln -sf thunderbird-sve-`date +%F`.tgz archive/thunderbird-sve.tgz

cheapupdate: chrome/sve.jar
	cp chrome/sve.jar ~/.mozilla-thunderbird/default/*/extensions/\{ff7e40e0-08b4-11d9-9669-0800200c9a66\}/chrome/sve.jar

deploy: package
	scp sve.xpi archive/thunderbird-sve.tgz publius:www/code/spf
