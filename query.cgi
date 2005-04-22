#!/usr/bin/perl
#
# MOZILLA THUNDERBIRD EXTENSION FOR SENDER POLICY FRAMEWORK
# AND DOMAINKEYS -- QUERY SERVER
#
# Copyright 2004 Joshua Tauberer <tauberer@for.net>, but with
# no rights reserved.  You're free to use this as you want.
#
# See: http://taubz.for.net/code/spf
#
# INSTALLATION REQUIREMENTS
# -------------------------
# This script has a number of dependencies.
#
# You will need to have openssl installed.  If you
# are running this script on an RPM-based distro, install
# both the openssl and openssl-devel packages. Do
# this first.
#
# You will also need to run these commands to make sure
# you have all of the required Perl modules installed:
#
#   cpan Digest::MD5
#   cpan MIME::Base64
#   cpan Mail::SPF::Query
#   cpan Mail::DomainKeys
#   cpan Crypt::OpenSSL::Bignum
#   cpan Crypt::RSA
#
# This script expects "query.log" to be a writable
# file in the same directory as this script.  You might have
# to make a world-writable file if Apache isn't executing
# scripts as you, or just disable logging.
#
# LOOK OUT FOR...
#
# If you have a "search" directive in your resolve.conf that
# points to a domain that resolves all subdomains with a
# wildcard, the SURBL spammer check will be confused.  You'll
# need to disable SURBL in the options section below or make
# some modifications to the SURBL subroutine.
#
############################################################

########################
####### OPTIONS ########
########################

# Set this to 0 to turn off logging, or 1 to
# log requests (anonymously) to 'query.log',
# but make sure the file is writeable.
$EnableLogging = 1;

# Turns on and off SURBL lookups, to see
# if the From: or Return-Path: addresses are
# from known spamming or phishing domains.
$EnableSURBL = 1;

# Enable or disable DomainKeys checking.
$EnableDomainKeys = 1;

# Set the hostname of this machine, for informational
# purposes only.
$Hostname = "jt.2rad.net";

########################
#### END OF OPTIONS ####
########################

#### BEGIN MODULES #####

# MODULES FOR SPF
use Mail::SPF::Query;

# MODULES FOR DOMAINKEYS
use Mail::DomainKeys::Signature;
use Mail::DomainKeys::Key::Public;
use Crypt::OpenSSL::Bignum;
use Crypt::RSA::Primitives;
use Crypt::RSA::DataFormat qw(octet_len os2ip i2osp octet_xor mgf1);
use Crypt::RSA::Key::Public;
use MIME::Base64;

# MODULES FOR LOGGING QUERIES
use Digest::MD5 qw(md5_base64); # Delete this line and disable
								# logging if Digest::MD5 isn't
								# available.

#### GENERAL SETUP #####

# Catch errors and output them to the user so that
# an administrator (me) can diagnose the problem.
$SIG{__DIE__} = sub { Die("Server Error: " . $_[0]); };
	
# Parse The Query Parameters
if ($ARGV[0] ne "") { $ENV{QUERY_STRING} = join("&", @ARGV); }
while ($ENV{QUERY_STRING} =~ /(^|\&)(\w+)=([^\&]+)/g) {
	my $name = $2;
	my $value = $3;
	$q{$name} = $value;
	$q{$name} =~ s/%(\d\d)/chr(hex($1))/eg;
	$q{$name} =~ s/\s+//g; # prevent the log from being corrupted
}

# Older clients had some problems.

# IP and HELO reversed?
if ($q{ip} =~ /^[a-z]/ && $q{helo} =~ /^\d/) {
	my $x = $q{ip}; $q{ip} = $q{helo}; $q{helo} = $x; }

# HELO has more than the hostname?
if ($q{helo} =~ /\(HELO([^)]+)\)/) { $q{helo} = $1; }

###########################
# BEGIN THE ACTUAL CHECKS #
###########################

# Die("Quit with a message to all users.");

if ($q{agent} eq "spf:0.1" || $q{agent} eq "spf:0.2") {
	Die("You're using an old version of this extension.  You should upgrade.");
}

my $result = 'none';
my $comment;
my $domain;
my $method;

# Perform an SPF check on the from address, and then the envelope address.
# The envfrom parameter should only be given if it is different
# from the from parameter.
foreach my $addr ($q{from}, $q{envfrom}) {
	if ($result eq "pass") { next; } # don't bother with check
	if ($addr eq "") { next; } # one of these may not be specified	
	$addr = lc($addr);
	
	my $d = $addr;
	$d =~ s/^([\w\W]+)\@//;

	my $r;
	my $c;

	# Check SURBL on the domain of the address
	if ($EnableSURBL) {
		($r, $c) = SURBL($addr);
		if (defined($r)) {
			$result = $r;
			$comment = $c;
			$domain = $d;
			$method = "surbl";
			last;
		}
	}

	# Check SPF
	($r, $c) = SPF(0, $addr);
	if ($r eq "neutral" || $r eq "none") {
		# Attempt a best guess, but only use it if it's positive.
		($r2, $c2) = SPF(1, $addr);
		if ($r2 eq "pass") {
			$r = $r2;
			$c = $c2;
		}
	}
	
	# If we've gotten here, the result before this check
	# was either none, neutral, or fail.  The SPF result
	# is none, neutral, fail, or pass.  Aside from none,
	# the result we get is always more informative than
	# the result we had, so take it.
	if ($r ne "none") {
		$result = $r;
		$comment = $c;
		$domain = $d;
		$method = "spf";
	}
}

# DomainKeys Check
$diddk = 0;
if ($result ne "pass" && $q{domainkeys_hash} ne "" && $EnableDomainKeys) {
	# Get the expected SHA1 hash based on the DomainKeys header.
	# Only do this if we're not already returning a 'pass' status
	# and we have the DK header to check.
	$diddk = 1;
	my ($dkdomain, $expected_hash) = DK($q{domainkeys_header});
	
	# Does the expected hash match the hash?
	if ($expected_hash eq $q{domainkeys_hash}) {
		$result = "pass";
		$comment = "The DomainKeys signature was verified from <$dkdomain>.";
		$domain = $dkdomain;
		$method = "dk";
	} elsif ($result eq 'none') {
		# Report neutral to indicate the domain supports something
		# but verification nevertheless was not successful.
		$result = 'neutral';
	}
}

if ($EnableLogging) {
	# Log the query (anonymously)
	open LOG, ">>query.log";
	flock(LOG, 2);
	seek(LOG, 0, 2);
	my $time = time;
	my $user = md5_base64($ENV{REMOTE_ADDR});
	my $emailDomain = $domain;
	if ($emailDomain eq "") { $q{from} =~ /\@([\w\W]+)$/; $emailDomain = $1; }
	if ($emailDomain eq "") { $q{envfrom} =~ /\@([\w\W]+)$/; $emailDomain = $1; }
	if ($emailDomain eq "") { $emailDomain = "unknown"; }
	print LOG "$time\t$q{agent}\t$emailDomain\t$result\t$user\t$diddk\n";
	close LOG;
}

# Output the result

# Perform a reverse DNS to pass back to the client.
($reversedns) = gethostbyaddr(pack('C4',split('\.',$q{ip})),2);

$result = Escape($result);
$comment = Escape($comment);
$domain = Escape($domain);

print <<EOF;
Content-type: text/xml

<query>
	<request>
EOF

# Repeat the query in the response
foreach my $k (keys(%q)) {
	print "		<$k>" . Escape($q{$k}) . "</$k>\n";
}

print <<EOF;
	</request>
	<response>
		<result>$result</result>
		<comment>$comment</comment>
		<domain>$domain</domain>
		<reversedns>$reversedns</reversedns>
		<method>$method</method>
	</response>
</query>
EOF

sub SPF {
	my $guess = shift;
	my $sender = shift;

	my $query = new Mail::SPF::Query (ip => $q{ip}, sender => $sender, helo=>$q{helo}, trusted=>1, guess=>$guess);

	my ($result,   # pass | fail | softfail | neutral | none | error | unknown [mechanism]
	 $smtp_comment,     # "please see http://spf.pobox.com/why.html?..."  when rejecting, return this string to the SMTP client
	 $header_comment,   # prepend_header("Received-SPF" => "$result ($header_comment)")
	 $spf_record,       # "v=spf1 ..." original SPF record for the domain
	 ) = $query->result();

	if ($result ne "pass" && $result ne "fail" && $result ne "none") {
		$result = "neutral";
	}

	my $h = quotemeta($Hostname);
	$header_comment =~ s/$h: (\w)/'SPF: ' . uc($1)/e;
	my $comment = $header_comment;
	
	if ($result eq "pass") {
		if (!$guess) {
			$comment = "The domain of the email was explicitly permitted via SPF.";
		} else {
			$comment = "The domain of the email was implicitly permitted via SPF/guess.";
		}
	}

	return ($result, $comment);
}

sub DK {
	my $sig = shift;
	$sig = Mail::DomainKeys::Signature->parse(String => $sig);
	
	# Fetch the public key
	my $pubk = fetch Mail::DomainKeys::Key::Public(
		Protocol => $sig->protocol,
		Selector => $sig->selector,
		Domain => $sig->domain);
	if (!defined($pubk)) { return undef; }
	if ($pubk->revoked) { return undef; }
	
	# Granularity must match the local part
	# of either of the From: or envelope addresses.
	# We're only interested in verifying the domain
	# of the sender anyway, for now at least.
	if ($pubk->granularity ne "") {
		my $granmatch = 0;
		my $gran = quotemeta($pubk->granularity);
		foreach my $addr ($q{from}, $q{envfrom}) {
			if ($addr =~ /^$gran\@/) { $granmatch = 1; last; }
		}
		if (!$granmatch) { return undef; }
	}	

	# The following is based on Crypt::RSA::SS::PSS.
	# If anyone reading can get this to work with
	# $pubk->cork directly, that'd be preferable.
	
	my ($kn, $ke) = $pubk->cork->get_key_parameters();
	my $key = bless { e => $ke->to_decimal, n => $kn->to_decimal }, 'Crypt::RSA::Key::Public';

	my $rsa = Crypt::RSA::Primitives->new();
	my $S = MIME::Base64::decode($sig->signature);
	my $k = octet_len ($key->n);
	my $s = os2ip ($S);
	my $m = $rsa->core_verify (Key => $key, Signature => $s) || return undef;
	my $em1 = i2osp ($m, $k-1) || return undef;
	$em1 = substr($em1, length($em1) - 20, 20);
	$em1 = MIME::Base64::encode($em1);
	$em1 =~ s/[=\s]+$//;
	return ($sig->domain, $em1);
}

sub SURBL {
	# Run the domain through SURBL to check for known
	# phishers and spammers.
	
	# Get the domain in the format SURBL expects
	my $domain = $_[0];
	$domain =~ /\@([\w\W]+)$/;
	$domain = $1;
	if ($domain =~ /\.(com|edu|gov|int|mil|net|org|biz|info|name|pro|aero|coop|museum)$/) {
		$domain =~ /([^.]+\.[a-z]+)$/;
		$domain = $1;
	} else {
		$domain =~ /([^.]+\.[^.]+\.[a-z]+)$/;
		$domain = $1;
	}
	
	# This comes from somewhere on the SURBL website.
	my $whitelist = <<EOF;
 yahoo.com w3.org msn.com com.com yimg.com
hotmail.com doubleclick.net flowgo.com ebaystatic.com aol.com
akamai.net yahoogroups.com ebay.com classmates.com akamaitech.net
incredimail.com tiscali.co.uk google.com chtah.com ediets.com
directtrack.com microsoft.com paypal.com jexiste.fr amazon.com
nytimes.com unitedoffers.com sitesolutions.it m0.net hyperpc.co.jp
terra.com.br macromedia.com ed10.net earthlink.net citibank.com
sourceforge.net marketwatch.com comcast.net messagelabs.com mcafee.com
grisoft.com geocities.com yourfreedvds.com smileycentral.com ual.com
monster.com e-trend.co.jp cnn.com cnet.com bfi0.com
atdmt.com sportsline.com rs6.net rr.com redhat.com
partner2profit.com joingevalia.com hotbar.com advertising.com topica.com
rm04.net ed4.net dsbl.org extm.us edgesuite.net
debian.org click-url.com bbc.co.uk adobe.com gte.net
go.com weatherbug.com speedera.net sbcglobal.net ientrymail.com
ibm.com att.net apple.com 5iantlavalamp.com verizon.net
plaxo.com pandasoftware.com p0.com mediaplex.com gmail.com
exacttarget.com constantcontact.com sf.net roving.com netflix.com
moveon.org cc-dt.com xmr3.com spamcop.net postdirect.com
norman.com netatlantic.com mail.com investorplace.com hitbox.com
citizensbank.com chase.com bridgetrack.com apache.org washingtonpost.com
si.com shockwave.com sears.com quickinspirations.com prserv.net
mac.com myweathercheck.com dsi-enews.net cheaptickets.com bravenet.com
arcamax.com afa.net 4at1.com yahoo.co.uk uclick.com
suntrust.com sun.com ups.com pcmag.com mycomicspage.com
EOF

	my $qdomain = quotemeta($domain);
	if ($whitelist =~ /\s$domain\s/) { return undef; }
	
	my $addr = gethostbyname("$domain.multi.surbl.org");
	if (defined($addr)) {
		my ($a1, $a2, $a3, $a4) = unpack('C4', $addr);
		if (($a4 & 8) != 0) {
			# I've never seen this happen, but maybe one day...
			return ("phishing", "The domain <$domain> is known to be a scam.  It should not be trusted.");
		} elsif ($a4 != 0) {
			return ("spamming", "The domain <$domain> is a known spammer.  It should not be trusted.");
		}
	}
	
	return undef;
}

sub Escape {
	my $a = $_[0];
	$a =~ s/\&/\&amp;/g;
	$a =~ s/\</\&lt;/g;
	$a =~ s/\>/\&gt;/g;
	return $a;
}

sub Die {
	my $msg = shift;
	$msg = Escape($msg);
	print <<EOF;
Content-Type: text/xml

<query>
	<response>
		<result>error</result>
		<comment>$msg</comment>
	</response>
</query>
EOF
	exit(0);
};


