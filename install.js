/*
 This license covers this file only.
 This file was derived from a file
 distributed at http://extensions.roachfiend.com.
 Thanks go out to that website.
 
- Version: MPL 1.1/GPL 2.0/LGPL 2.1
-
- The contents of this file are subject to the Mozilla Public License Version
- 1.1 (the "License"); you may not use this file except in compliance with
- the License. You may obtain a copy of the License at
- http://www.mozilla.org/MPL/
-
- Software distributed under the License is distributed on an "AS IS" basis,
- WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
- for the specific language governing rights and limitations under the
- License.
-
-
- The Initial Developer of the Original Code is Eric Hamiter <ehamiter@gmail.com>.
- Portions created by the Initial Developer are Copyright (C) 2002-2003
- the Initial Developer. All Rights Reserved.
-
-
- Alternatively, the contents of this file may be used under the terms of
- either the GNU General Public License Version 2 or later (the "GPL"), or
- the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
- in which case the provisions of the GPL or the LGPL are applicable instead
- of those above. If you wish to allow use of your version of this file only
- under the terms of either the GPL or the LGPL, and not to allow others to
- use your version of this file under the terms of the MPL, indicate your
- decision by deleting the provisions above and replace them with the notice
- and other provisions required by the LGPL or the GPL. If you do not delete
- the provisions above, a recipient may use your version of this file under
- the terms of any one of the MPL, the GPL or the LGPL.
*/


// XpiInstaller
// By Pike (Heavily inspired by code from Henrik Gemal and Stephen Clavering)

var XpiInstaller = {

	// --- Editable items begin ---
	extFullName: 'Sender Policy Framework Extension', // The name displayed to the user (don't include the version)
	extShortName: 'spf', // The leafname of the JAR file (without the .jar part)
	extVersion: '0.2',
	extAuthor: 'Joshua Tauberer',
	extLocaleNames: null, // e.g. ['en-US', 'en-GB']
	extSkinNames: null, // e.g. ['classic', 'modern']
	extPostInstallMessage: 'Success! Please restart your browser to finish the installation.', // Set to null for no post-install message
	// --- Editable items end ---

	profileInstall: true,
	silentInstall: false,

	install: function()
	{
		var jarName = this.extShortName + '.jar';
		var profileDir = Install.getFolder('Profile', 'chrome');

		// Parse HTTP arguments
		this.parseArguments();

		// Check if extension is already installed in profile
		if (File.exists(Install.getFolder(profileDir, jarName)))
		{
			if (!this.silentInstall)
			{
				Install.alert('Updating existing Profile install of ' + this.extFullName + ' to version ' + this.extVersion + '.');
			}
			this.profileInstall = true;
		}
		else if (!this.silentInstall)
		{
			// Ask user for install location, profile or browser dir?
			this.profileInstall = Install.confirm('Install ' + this.extFullName + ' ' + this.extVersion + ' to your Profile directory (OK) or your Browser directory (Cancel)?');
		}

		// Init install
		var dispName = this.extFullName + ' ' + this.extVersion;
		var regName = '/' + this.extAuthor + '/' + this.extShortName;
		Install.initInstall(dispName, regName, this.extVersion);

		// Find directory to install into
		var installPath;
		if (this.profileInstall) installPath = profileDir;
		else installPath = Install.getFolder('chrome');

		// Add JAR file
		Install.addFile(null, 'chrome/' + jarName, installPath, null);

		// Register chrome
		var jarPath = Install.getFolder(installPath, jarName);
		var installType = this.profileInstall ? Install.PROFILE_CHROME : Install.DELAYED_CHROME;

		// Register content
		Install.registerChrome(Install.CONTENT | installType, jarPath, 'content/' + this.extShortName + '/');

		// Register locales
		for (var locale in this.extLocaleNames)
		{
			var regPath = 'locale/' + this.extLocaleNames[locale] + '/' + this.extShortName + '/';
			Install.registerChrome(Install.LOCALE | installType, jarPath, regPath);
		}

		// Register skins
		for (var skin in this.extSkinNames)
		{
			var regPath = 'skin/' + this.extSkinNames[skin] + '/' + this.extShortName + '/';
			Install.registerChrome(Install.SKIN | installType, jarPath, regPath);
		}

		// Perform install
		var err = Install.performInstall();
		if (err == Install.SUCCESS || err == Install.REBOOT_NEEDED)
		{
			if (!this.silentInstall && this.extPostInstallMessage)
			{
				Install.alert(this.extPostInstallMessage);
			}
		}
		else
		{
			this.handleError(err);
			return;
		}
	},

	parseArguments: function()
	{
		// Can't use string handling in install, so use if statement instead
		var args = Install.arguments;
		if (args == 'p=0')
		{
			this.profileInstall = false;
			this.silentInstall = true;
		}
		else if (args == 'p=1')
		{
			this.profileInstall = true;
			this.silentInstall = true;
		}
	},

	handleError: function(err)
	{
		if (!this.silentInstall)
		{
			Install.alert('Error: Could not install ' + this.extFullName + ' ' + this.extVersion + ' (Error code: ' + err + ')');
		}
		Install.cancelInstall(err);
	}
};

XpiInstaller.install();
