JARSOURCES=\
	content/contents.rdf \
	content/sha1.js content/dns.js content/spf.js content/sve.js  \
	content/spf.xul content/options.xul \
	content/misc.js content/trustedmta.xul content/trustedforwarder.xul

XPISOURCES=\
	install.rdf \
	install.js \
	chrome/spf.jar

all: spf.xpi package

spf.xpi: $(XPISOURCES)
	zip -q spf.xpi $(XPISOURCES)

chrome/spf.jar: $(JARSOURCES)
	mkdir -p chrome
	zip -q chrome/spf.jar $(JARSOURCES)

package: spf.xpi chrome/spf.jar
	tar -C .. -czf archive/thunderbird-spf-`date +%F`.tgz \
		thunderbird-spf/chrome \
		thunderbird-spf/content --exclude thunderbird-spf/content/.svn \
		thunderbird-spf/install.js \
		thunderbird-spf/install.rdf \
		thunderbird-spf/Makefile \
		thunderbird-spf/query.cgi \
		thunderbird-spf/README \
		thunderbird-spf/spf.xpi
	ln -sf thunderbird-spf-`date +%F`.tgz archive/thunderbird-spf.tgz

cheapupdate: chrome/spf.jar
	cp chrome/spf.jar ~/.thunderbird/default/*/extensions/\{ff7e40e0-08b4-11d9-9669-0800200c9a66\}/chrome/spf.jar

deploy: package
	scp spf.xpi archive/thunderbird-spf.tgz publius:www/code/spf
