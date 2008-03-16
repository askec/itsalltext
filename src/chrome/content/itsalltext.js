/*extern Components, Firebug, getBoolPref, openDialog, getBrowser, gBrowser */
/*jslint undef: true, nomen: true, evil: false, browser: true, white: true */

/*
 *  It's All Text! - Easy external editing of web forms.
 *
 *  Copyright (C) 2006-2007 Christian Höltje
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

// @todo [9] IDEA: dropdown list for charsets (utf-8, western-iso, default)?
// @todo [wish] Have a menu/context menu item for turning on monitoring/watch.
// @todo [9] Menu item to pick the file to load into a textarea.
// @todo [9] IDEA: Hot-keys opening the context menu.

var ItsAllText = function () {
    /**
     * This data is all private, which prevents security problems and it
     * prevents clutter and collection.
     * @type Object
     */
    var that = this,
        loadthings;

    /**
     * Used for tracking all the all the textareas that we are watching.
     * @type Hash
     */
    that.tracker = {};

    /**
     * A serial for tracking ids
     * @type Integer
     */
    that.serial_id = 0;

    /**
     * A constant, a string used for things like the preferences.
     * @type String
     */
    that.MYSTRING = 'itsalltext';

    /**
     * A constant, the version number.  Set by the Makefile.
     * @type String
     */
    that.VERSION = '999.@@VERSION@@';

    /**
     * A constant, the url to the readme.
     * @type String
     */
    that.README = 'chrome://itsalltext/locale/readme.xhtml';

    /* The XHTML Namespace */
    that.XHTMLNS = "http://www.w3.org/1999/xhtml";

    /* The XUL Namespace */
    that.XULNS   = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";

    that.thread_id = Math.round(new Date().getTime() * Math.random());

    /**
     * Formats a locale string, replacing $N with the arguments in arr.
     * @param {String} name Locale property name
     * @param {Array} arr Array of strings to replace in the string.
     * @returns String
     */
    that.localeFormat = function (name, arr) {
        return this.getLocale().formatStringFromName(name, arr, arr.length);
    };
    /**
     * Returns the locale string matching name.
     * @param {String} name Locale property name
     * @returns String
     */
    that.localeString = function (name) {
        return this.getLocale().GetStringFromName(name);
    };

    /**
     * Create an error message from given arguments.
     * @param {Object} message One or more objects to be made into strings...
     */
    that.logString = function () {
        var args = Array.prototype.slice.apply(arguments, [0]),
            i;
        for (i = 0; i < args.length; i++) {
            try {
                args[i] = "" + args[i];
            } catch (e) {
                Components.utils.reportError(e);
                args[i] = 'toStringFailed';
            }
        }
        args.unshift(that.MYSTRING + ' [' + this.thread_id + ']:');
        return args.join(' ');
    };

    /**
     * This is a handy debug message.  I'll remove it or disable it when
     * I release this.
     * @param {Object} message One or more objects can be passed in to display.
     */
    that.log = function () {
        const consoleService = Components.classes["@mozilla.org/consoleservice;1"];
        var message = that.logString.apply(that, arguments),
            obj = consoleService.getService(Components.interfaces.nsIConsoleService);
        try {
            // idiom: Convert arguments to an array for easy handling.
            obj.logStringMessage(message);
        } catch (e) {
            Components.utils.reportError(message);
        }
    };

    /**
     * Uses log iff debugging is turned on.  Used for messages that need to
     * globally logged (firebug only logs locally).
     * @param {Object} message One or more objects can be passed in to display.
     */
    that.debuglog = function () {
        if (that.preferences.debug) {
            that.log.apply(that, arguments);
        }
    };

    /**
     * Displays debug information, if debugging is turned on.
     * Requires Firebug.
     * @param {Object} message One or more objects can be passed in to display.
     */
    that.debug = function () {
        var message = that.logString.apply(that, arguments);
        window.dump(message + '\n');
        if (that.preferences && that.preferences.debug) {
            try {
                Firebug.Console.logFormatted(arguments);
            } catch (e) {
            }
        }
    };

    /**
     * A factory method to make an nsILocalFile object.
     * @param {String} path A path to initialize the object with (optional).
     * @returns {nsILocalFile}
     */
    that.factoryFile = function (path) {
        var file = Components.
            classes["@mozilla.org/file/local;1"].
            createInstance(Components.interfaces.nsILocalFile);
        if (typeof(path) == 'string' && path !== '') {
            file.initWithPath(path);
        }
        return file;
    };

    /**
     * Returns the directory where we put files to edit.
     * @returns nsILocalFile The location where we should write editable files.
     */
    that.getEditDir = function () {
        /* Where is the directory that we use. */
        var fobj = Components.classes["@mozilla.org/file/directory_service;1"].
            getService(Components.interfaces.nsIProperties).
            get("ProfD", Components.interfaces.nsIFile);
        fobj.append(that.MYSTRING);
        if (!fobj.exists()) {
            fobj.create(Components.interfaces.nsIFile.DIRECTORY_TYPE,
                        parseInt('0700', 8));
        }
        if (!fobj.isDirectory()) {
            that.error(that.localeFormat('problem_making_directory', [fobj.path]));
        }
        return fobj;
    };

    /* Clean the edit directory whenever we create a new window. */
    that.cleanEditDir();

    loadthings = function () {
        /* Load the various bits needed to make this work. */
        var loader = Components.classes["@mozilla.org/moz/jssubscript-loader;1"].getService(Components.interfaces.mozIJSSubScriptLoader);
        loader.loadSubScript('chrome://itsalltext/content/Color.js', that);
        loader.loadSubScript('chrome://itsalltext/content/monitor.js', that);
        loader.loadSubScript('chrome://itsalltext/content/cacheobj.js', that);
        that.new_monitor = new that.new_monitor(that);
    };
    loadthings();

    /**
     * Dictionary for storing the preferences in.
     * @type Hash
     */
    that.preferences = {
        debug: true,

        /**
         * Fetches the current value of the preference.
         * @private
         * @param {String} aData The name of the pref to fetch.
         * @returns {Object} The value of the preference.
         */
        private_get: function (aData) {
            var po = that.preference_observer,
                real_type = po.types[aData],
                type = real_type === 'Float' ? 'Char' : real_type,
                retval = '';
            retval = po.private_branch['get' + type + 'Pref'](aData);
            return real_type === 'Float' ? parseFloat(retval) : retval;
        },

        /**
         * Sets the current preference.
         * @param {String} aData The name of the pref to change.
         * @param {Object} value The value to set.
         */
        private_set: function (aData, value) {
            var po = that.preference_observer,
                real_type = po.types[aData],
                type = real_type === 'Float' ? 'Char' : real_type;
            if (real_type === 'Float') {
                value = '' + parseFloat(value);
            }
            po.private_branch['set' + type + 'Pref'](aData, value);
        }
    };

    /**
     * A Preference Observer.
     */
    that.preference_observer = {
        /**
         * Dictionary of types (well, really the method needed to get/set the
         * type.
         * @type Hash
         */
        types: {
            charset:            'Char',
            editor:             'Char',
            refresh:            'Int',
            debug:              'Bool',
            gumdrop_position:   'Char',
            fade_time:          'Float',
            extensions:         'Char',
            hotkey:             'Char'
        },

        /**
         * Register the observer.
         */
        register: function () {
            var prefService = Components.
                classes["@mozilla.org/preferences-service;1"].
                getService(Components.interfaces.nsIPrefService),
                type;
            this.private_branch = prefService.getBranch("extensions." + that.MYSTRING + ".");
            this.private_branch.QueryInterface(Components.interfaces.nsIPrefBranch2);
            this.private_branch.addObserver("", this, false);
            /* setup the preferences */
            for (type in this.types) {
                if (this.types.hasOwnProperty(type)) {
                    that.preferences[type] = that.preferences.private_get(type);
                }
            }
        },

        /**
         * Unregister the observer. Not currently used, but may be
         * useful in the future.
         */
        unregister: function () {
            if (!this.private_branch) {
                return;
            }
            this.private_branch.removeObserver("", this);
        },

        /**
         * Observation callback.
         * @param {String} aSubject The nsIPrefBranch we're observing (after appropriate QI)e
         * @param {String} aData The name of the pref that's been changed (relative to the aSubject).
         * @param {String} aTopic The string defined by NS_PREFBRANCH_PREFCHANGE_TOPIC_ID
         */
        observe: function (aSubject, aTopic, aData) {
            if (aTopic != "nsPref:changed") {
                return;
            }
            if (that.preferences) {
                that.preferences[aData] = that.preferences.private_get(aData);
                if (aData == 'refresh') {
                    that.new_monitor.restart();
                }
            }
        }

    };

    /**
     * A Preference Option: What character set should the file use?
     * @returns {String} the charset to be used.
     */
    that.getCharset = function () {
        return that.preferences.charset;
    };

    /**
     * A Preference Option: How often should we search for new content?
     * @returns {int} The number of seconds between checking for new content.
     */
    that.getRefresh = function () {
        var refresh = that.preferences.refresh;
        if (!refresh || refresh < 1) {
            that.debug('Invalid refresh:', refresh);
            refresh = 1;
        }
        return 1000 * refresh;

    };

    /**
     * Returns true if the system is running Mac OS X.
     * @returns {boolean} Is this a Mac OS X system?
     */
    that.isDarwin = function () {
        /* more help:
         http://developer.mozilla.org/en/docs/Code_snippets:Miscellaneous#Operating_system_detection
        */

        var is_darwin = that.private_is_darwin;
        if (typeof(is_darwin) == 'undefined') {
            is_darwin = /^Darwin/i.test(Components.classes["@mozilla.org/xre/app-info;1"].getService(Components.interfaces.nsIXULRuntime).OS);
            that.private_is_darwin = is_darwin;
        }
        return is_darwin;
    };

    /**
     * A Preference Option: What editor should we use?
     *
     * Note: On some platforms, this can return an
     * NS_ERROR_FILE_INVALID_PATH exception and possibly others.
     *
     * For a complete list of exceptions, see:
     * http://lxr.mozilla.org/seamonkey/source/xpcom/base/nsError.h#262
     * @returns {nsILocalFile} A file object of the editor.
     */
    that.getEditor = function () {
        var editor = that.preferences.editor,
            retval = null;

        if (editor === '' && that.isDarwin()) {
            editor = '/usr/bin/open';
            that.preferences.private_set('editor', editor);
        }

        if (editor !== '') {
            retval = that.factoryFile(editor);
        }
        return retval;
    };

    /**
     * A Preference Option: should we display debugging info?
     * @returns {bool}
     */
    that.getDebug = function () {
        return that.preferences.debug;
    };

    /**
     * A Preference Option: Are the edit gumdrops disabled?
     * @returns {bool}
     */
    that.getDisableGumdrops = function () {
        return that.preferences.gumdrop_position === 'none';
    };

    /**
     * A Preference Option: The list of extensions
     * @returns Array
     */
    that.getExtensions = function () {
        var string = that.preferences.extensions.replace(/[\n\t ]+/g, ''),
            extensions = string.split(',');
        if (extensions.length === 0) {
            return ['.txt'];
        } else {
            return extensions;
        }
    };

    /**
     * Open the preferences dialog box.
     * @param{boolean} wait The function won't return until the preference is set.
     * @private
     * Borrowed from http://wiki.mozilla.org/XUL:Windows
     * and utilityOverlay.js's openPreferences()
     */
    that.openPreferences = function (wait) {
        wait = typeof(wait) == 'boolean' ? wait : false;
        var paneID = that.MYSTRING + '_preferences',
            instantApply = getBoolPref("browser.preferences.instantApply", false) && !wait,
            features = "chrome,titlebar,toolbar,centerscreen" + (instantApply ? ",dialog=no" : ",modal"),
            xpcom_wm = Components.classes["@mozilla.org/appshell/window-mediator;1"],
            wm = xpcom_wm.getService(Components.interfaces.nsIWindowMediator),
            win = wm.getMostRecentWindow("Browser:Preferences"),
            pane;
        if (win) {
            win.focus();
            if (paneID) {
                pane = win.document.getElementById(paneID);
                win.document.documentElement.showPane(pane);
            }
        } else {
            openDialog('chrome://itsalltext/content/preferences.xul',
                       "", features, paneID);
        }
    };

    /**
     * A Preference Option: Append an extension
     * @returns Array
     */
    that.appendExtensions = function (ext) {
        var current = that.getExtensions(),
            value,
            i;
        ext = ext.replace(/[\n\t ]+/g, '');
        for (i = 0; i < current.length; i++) {
            if (ext == current[i]) {
                return; // Don't add a duplicate.
            }
        }

        value = that.preferences.extensions;
        if (value.replace(/[\t\n ]+/g) === '') {
            value = ext;
        } else {
            value = [value, ',', ext].join('');
        }
        that.preferences.private_set('extensions', value);
    };

    // @todo [wish] Profiling and optimization.

    /**
     * Cleans out all old cache objects.
     */
    that.cleanCacheObjs = function () {
        var count = 0,
            cobj,
            id,
            cdoc;
        for (id in that.tracker) {
            if (that.tracker.hasOwnProperty(id)) {
                cobj = that.tracker[id];
                cdoc = cobj.node.ownerDocument;
                if (!cdoc.defaultView || !cdoc.location) {
                    cobj.destroy();
                    cdoc = null;
                    delete that.tracker[id];
                } else {
                    count += 1;
                }
            }
        }
        that.debug('textarea count (tracker):', count);
    };

    /**
     * Refresh Textarea.
     * @param {Object} node A specific textarea dom object to update.
     */
    that.refreshTextarea = function (node, is_chrome) {
        var cobj = ItsAllText.getCacheObj(node);
        if (!cobj) {
            return;
        }

        cobj.update();
        if (!is_chrome) {
            cobj.addGumDrop();
        }
    };

    // @todo [wish] Refresh textarea on editor quit.
    // @todo [9] IDEA: support for input elements as well?
    // @todo [5] Minimum size for textareas.
    // @todo [5] Mark textareas somehow as 'in editor'.

    /**
     * Refresh Document.
     * @param {Object} doc The document to refresh.
     */
    that.refreshDocument = function (doc) {
        if (!doc.location) {
            return; // it's being cached, but not shown.
        }
        var is_chrome = (doc.location.protocol == 'chrome:' &&
                         doc.location.href != that.README),
            nodes = doc.getElementsByTagName('textarea'),
            i;
        for (i = 0; i < nodes.length; i++) {
            that.refreshTextarea(nodes[i], is_chrome);
        }
        nodes = doc.getElementsByTagName('textbox');
        for (i = 0; i < nodes.length; i++) {
            that.refreshTextarea(nodes[i], is_chrome);
        }
    };

    /**
     * Returns the offset from the containing block.
     * @param {Object} node A DOM element.
     * @param {Object} container If unset, then this will use the offsetParent of node. Pass in null to go all the way to the root.
     * @return {Array} The X & Y page offsets
     */
    that.getContainingBlockOffset = function (node, container) {
        if (typeof(container) == 'undefined') {
            container = node.offsetParent;
        }
        var pos = [node.offsetLeft, node.offsetTop],
            pnode = node.offsetParent;
        while (pnode && (container === null || pnode != container)) {
            pos[0] += pnode.offsetLeft || 0;
            pos[1] += pnode.offsetTop  || 0;
            pos[0] -= pnode.scrollLeft || 0;
            pos[1] -= pnode.scrollTop  || 0;
            pnode = pnode.offsetParent;
        }
        return pos;
    };


    /**
     * marshals a keypress event.
     */
    that.marshalKeyEvent = function (event) {
        var marshal = [event.altKey  ? 1 : 0,
                       event.ctrlKey ? 1 : 0,
                       event.metaKey ? 1 : 0,
                       event.shiftKey ? 1 : 0,
                       event.charCode,
                       event.keyCode];
        marshal = marshal.join(':');
        return marshal;
    };

    that.keyMap = {
        8   : 'Backspace',
        9   : 'Tab',
        13  : 'Enter',
        19  : 'Break',
        27  : 'Escape',
        33  : 'PgUp',
        34  : 'PgDn',
        35  : 'End',
        36  : 'Home',
        37  : 'Left',
        38  : 'Up',
        39  : 'Right',
        40  : 'Down',
        45  : 'Insert',
        46  : 'Delete',
        112 : 'F1',
        113 : 'F2',
        114 : 'F3',
        115 : 'F4',
        116 : 'F5',
        117 : 'F6',
        118 : 'F7',
        119 : 'F8',
        120 : 'F9',
        121 : 'F10',
        122 : 'F11',
        144 : 'Num Lock',
        145 : 'Scroll Lock',
        ''  : '<none>'
    };

    /**
     * Converts a marshalled key event into a string.
     */
    that.keyMarshalToString = function (km) {
        var e = km.split(':'),
            out = [],
            c = parseInt(e[5], 10);
        if (e[0] === '1') {
            out.push('alt');
        }
        if (e[1] === '1') {
            out.push('ctrl');
        }
        if (e[2] === '1') {
            out.push('meta');
        }
        if (e[3] === '1') {
            out.push('shift');
        }
        if (e[4] === '0') {
            if (that.keyMap.hasOwnProperty(c)) {
                out.push(that.keyMap[c]);
            } else {
                out.push('code:' + c);
            }
        } else {
            out.push(String.fromCharCode(e[4]).toUpperCase());
        }
        return out.join(' ');
    };

    /**
     * This function is called regularly to watch changes to web documents.
     */
    that.old_monitor = {
        id: null,
        last_now: 0,
        documents: [],
        /**
         * Starts or restarts the document old_monitor.
         */
        restart: function () {
            var rate = that.getRefresh(),
                id   = that.old_monitor.id;
            if (id) {
                clearInterval(id);
            }
            that.old_monitor.id = setInterval(that.old_monitor.watcher, rate);
        },
        /**
         * watches the document 'doc'.
         * @param {Object} doc The document to watch.
         */
        watch: function (doc, force) {
            // fish
            var contentType,
                location,
                is_html,
                is_usable,
                is_my_readme,
                documents,
                i;
            if (!force) {
                /* Check that this is a document we want to play with. */
                contentType = doc.contentType;
                location = doc.location;
                is_html = (contentType == 'text/html' ||
                           contentType == 'text/xhtml' ||
                           contentType == 'application/xhtml+xml');
                //var is_xul=(contentType=='application/vnd.mozilla.xul+xml');
                is_usable = (is_html) &&
                    location &&
                    location.protocol != 'about:' &&
                    location.protocol != 'chrome:';
                try {
                    is_my_readme = location && location.href == that.README;
                    /*
                     * Avoiding this error.... I hope.
                     * uncaught exception: [Exception... "Component returned failure code: 0x80004003 (NS_ERROR_INVALID_POINTER) [nsIDOMLocation.href]"  nsresult: "0x80004003 (NS_ERROR_INVALID_POINTER)"  location: "JS frame :: chrome://itsalltext/chrome/itsalltext.js :: anonymous :: line 634"  data: no]
Line 0
                    */
                } catch (e) {
                    is_my_readme = false;
                    is_usable = false;
                }
                if (!(is_usable || is_my_readme)) {
                    that.debug('watch(): ignoring -- ', location, contentType);
                    return;
                }
            }

            documents = that.old_monitor.documents;
            for (i in documents) {
                if (documents[i] === doc) {
                    // Found it, don't watch it twice.
                    that.debug('narf: double watch: ', doc.location);
                    return;
                }
            }
            that.debug('watch()ing: ', doc && doc.location);
            that.refreshDocument(doc);
            that.old_monitor.documents.push(doc);
        },
        /**
         * Callback to be used by restart()
         * @private
         */
        watcher: function (offset) {
            var old_monitor = that.old_monitor,
                rate = that.getRefresh(),
                now = Date.now(),
                documents,
                i,
                doc;
            if (now - old_monitor.last_now < Math.round(rate * 0.9)) {
                that.debug('old_monitor.watcher(', offset, ') -- skipping catchup refresh');
                return;
            }
            old_monitor.last_now = now;

            /* Walk the documents looking for changes */
            documents = old_monitor.documents;
            for (i in documents) {
                if (documents.hasOwnProperty(i)) {
                    doc = documents[i];
                    if (doc.location) {
                        that.refreshDocument(doc);
                    }
                }
            }
        },
        /**
         * Stops watching doc.
         * @param {Object} doc The document to watch.
         */
        unwatch: function (doc) {
            var documents = that.old_monitor.documents,
                i;
            for (i in documents) {
                if (documents[i] === doc) {
                    that.debug('unwatch()ing', doc && doc.location);
                    delete documents[i];
                }
            }
            that.cleanCacheObjs();
            for (i = documents.length - 1; i >= 0; i--) {
                if (typeof(documents[i]) === 'undefined') {
                    documents.splice(i, 1);
                }
            }
        }
    };

    /**
     * Open the editor for a selected node.
     * @param {Object} node The textarea to get.
     */
    that.onEditNode = function (node) {
        var cobj = that.getCacheObj(node);
        if (cobj) {
            cobj.edit();
        }
        return;
    };

    /**
     * Triggered when the context menu is shown.
     * @param {Object} event The event passed in by the event handler.
     */
    that.onContextMenu = function (event) {
        var tid, node, tag, is_disabled, cobj, menu, cstyle, doc;
        if (event.target) {
            tid = event.target.id;
            if (tid == "itsalltext-context-popup" ||
                tid == "contentAreaContextMenu") {
                node = document.popupNode;
                tag = node.nodeName.toLowerCase();
                doc = node.ownerDocument;
                cstyle = doc.defaultView.getComputedStyle(node, '');
                is_disabled = (!(tag == 'textarea' ||
                                 tag == 'textbox') ||
                               node.style.display == 'none' ||
                               (cstyle && (cstyle.display == 'none' ||
                                           cstyle.visibility == 'hidden')) ||
                               node.getAttribute('readonly') ||
                               node.getAttribute('disabled')
                               );
                if (tid == "itsalltext-context-popup") {
                    cobj = that.getCacheObj(node);
                    that.rebuildMenu(cobj.uid,
                                     'itsalltext-context-popup',
                                     is_disabled);
                } else {
                    // tid == "contentAreaContextMenu"
                    menu = document.getElementById("itsalltext-contextmenu");
                    menu.setAttribute('hidden', is_disabled);
                }

            }
        }
        return true;
    };

    that.openReadme = function () {
        var browser = getBrowser();
        browser.selectedTab = browser.addTab(that.README, null);
    };


    // Do the startup when things are loaded.
    // TODONOW: move to separate function
    that.listen(window, 'load', function (event) {
        that.debug('!!load', event);
        if (typeof(gBrowser) === 'undefined') {
            that.new_monitor.registerPage(event);
        } else {
            // Add a callback to be run every time a document loads.
            // note that this includes frames/iframes within the document
            that.listen(gBrowser, "load",
                        that.new_monitor.registerPage, true);
        }

        // Start watching the preferences.
        that.preference_observer.register();

        // Setup the context menu whenever it is shown.
        var contentAreaContextMenu = document.getElementById("contentAreaContextMenu");
        if (contentAreaContextMenu) {
            that.listen(contentAreaContextMenu, 'popupshowing', that.hitch(that, 'onContextMenu'), false);
        }
    }, false);

    // TODONOW: move to separate function
    that.listen(window, 'unload', function (event) {
        if (typeof(gBrowser) === 'undefined') {
            that.new_monitor.stopPage(event);
        }
        var doc = event.originalTarget;
        that.debug("pageunload(): A page has been unloaded", doc && doc.location);
        that.cleanCacheObjs();
        that.preference_observer.unregister();
        that.new_monitor.destroy();
    }, false);

};

/**
 * This wraps the call to object.method to ensure that 'this' is correct.
 * This is borrowed from GreaseMonkey (though the concept has been around)
 * @method hitch
 * @param {Object} object
 * @param {String} method The method on object to call
 * @returns {Function} A wrapped call to object.method() which passes the arguments.
 */
ItsAllText.prototype.hitch = function (object, method) {
    if (!object[method]) {
        throw "method '" + method + "' does not exist on object '" + object + "'";
    }

    var staticArgs = Array.prototype.splice.call(arguments, 2, arguments.length);

    return function () {
        // make a copy of staticArgs (don't modify it because it gets reused for
        // every invocation).
        var args = staticArgs.concat(),
            i;

        // add all the new arguments
        for (i = 0; i < arguments.length; i++) {
            args.push(arguments[i]);
        }

        // invoke the original function with the correct this object and
        // the combined list of static and dynamic arguments.
        return object[method].apply(object, args);
    };
};

/**
 * @method listen
 * @param source {HTMLElement} The element to listen for events on.
 * @param event {String} The name of the event to listen for.
 * @param listener {Function} The function to run when the event is triggered.
 * @param opt_capture {Boolean} Should the event be captured?
 */
ItsAllText.prototype.listen = function (source, event, listener, opt_capture) {
    opt_capture = !!opt_capture;
    this.debug("listen(%o, %o, -, %o)", source, event, opt_capture);
    Components.lookupMethod(source, "addEventListener")(
        event, listener, opt_capture);
};

/**
 * @method unlisten
 * @param source {HTMLElement} The element with the event
 * @param event {String} The name of the event.
 * @param listener {Function} The function that was to be run when the event is triggered.
 * @param opt_capture {Boolean} Should the event be captured?
 */
ItsAllText.prototype.unlisten = function (source, event, listener, opt_capture) {
    opt_capture = !!opt_capture;
    this.debug("unlisten(%o, %o, -, %o)", source, event, opt_capture);
    Components.lookupMethod(source, "removeEventListener")(
        event, listener, opt_capture);
};

/**
 * Convert an event into a key fingerprint, aka keyprint.
 * @param {Event} event
 * @returns {String} keyprint
 */
ItsAllText.prototype.eventToKeyprint = function (event) {
    return [ event.ctrlKey,
             event.altKey,
             event.metaKey,
             event.shiftKey,
             event.keyCode,
             event.charCode ].join(':');
};

/**
 * Convert a keyprint to a string suitable for human display.
 * @param {String} keyprint
 * @return {String}
 */
ItsAllText.prototype.keyprintToString = function (keyprint) {
    var split = keyprint.split(':'),
        string = [];
    if (split[0] === 'true') {
        string.push('Ctrl');
    }
    if (split[1] === 'true') {
        string.push('Alt');
    }
    if (split[2] === 'true') {
        string.push('Meta');
    }
    if (split[3] === 'true') {
        string.push('Shift');
    }
    if (split[4] === '0') {
        string.push(String.fromCharCode(split[5]));
    } else {
        string.push('keyCode=', split[4]);
    }
    return string.join(' ');
};


/**
 * Cleans out the edit directory, deleting all old files.
 */
ItsAllText.prototype.cleanEditDir = function (force) {
    force = typeof(force) === 'boolean'?force:false;
    var last_week = Date.now() - (1000 * 60 * 60 * 24 * 7),
        fobj = this.getEditDir(),
        entries = fobj.directoryEntries,
        entry;
    while (entries.hasMoreElements()) {
        entry = entries.getNext();
        entry.QueryInterface(Components.interfaces.nsIFile);
        if (force || !entry.exists() || entry.lastModifiedTime < last_week) {
            try {
                entry.remove(false);
            } catch (e) {
                this.log('unable to remove', entry, 'because:', e);
            }
        }
    }
};


/**
 * The command that is called when picking a new extension.
 * @param {Event} event
 */
ItsAllText.prototype.menuNewExtEdit = function (event) {
    var that = this,
        uid = this.private_current_uid,
        cobj = that.getCacheObj(uid),
        params = {out: null},
        ext;
    window.openDialog("chrome://itsalltext/content/newextension.xul", "",
    "chrome, dialog, modal, resizable=yes", params).focus();
    if (params.out) {
        ext = params.out.extension.replace(/[\n\t ]+/g, '');
        if (params.out.do_save) {
            that.appendExtensions(ext);
        }
        cobj.edit(ext);
    }
};

/**
 * The command that is called when selecting an existing extension.
 * @param {Event} event
 * @param {string} ext
 * @param {boolean} clobber
 */
ItsAllText.prototype.menuExtEdit = function (ext, clobber, event) {
    var uid = this.private_current_uid,
        cobj;
    if (ext !== null) {
        ext = typeof(ext) === 'string'?ext:event.target.getAttribute('label');
    }
    this.debug('menuExtEdit:', uid, ext, clobber);
    //narf this.monitor.watch(cobj.node.ownerDocument);
    cobj.edit(ext, clobber);
};

/**
 * Rebuilds the option menu, to reflect the current list of extensions.
 * @private
 * @param {String} uid The UID to show in the option menu.
 */
ItsAllText.prototype.rebuildMenu = function (uid, menu_id, is_disabled) {
    menu_id = typeof(menu_id) == 'string'?menu_id:'itsalltext-optionmenu';
    is_disabled = (typeof(is_disabled) === 'undefined' || !is_disabled) ? false : (is_disabled && true);
    var i,
        that = this,
        exts = that.getExtensions(),
        menu = document.getElementById(menu_id),
        items = menu.childNodes,
        items_length = items.length - 1, /* We ignore the preferences item */
        node,
        magic_stop_node = null,
        magic_start = null,
        magic_stop = null,
        cobj = that.getCacheObj(uid);
    that.private_current_uid = uid;

    // Find the beginning and end of the magic replacement parts.
    for (i = 0; i < items_length; i++) {
        node = items[i];
        if (node.nodeName.toLowerCase() == 'menuseparator') {
            if (magic_start === null) {
                magic_start = i;
            } else if (magic_stop === null) {
                magic_stop = i;
                magic_stop_node = node;
            }
        } else if (node.nodeName.toLowerCase() == 'menuitem') {
            node.setAttribute('disabled', is_disabled?'true':'false');
        }
    }

    // Remove old magic bits
    for (i = magic_stop - 1; i > magic_start; i--) {
        menu.removeChild(items[i]);
    }

    if (cobj.edit_count <= 0 && cobj.file && cobj.file.exists()) {
        node = document.createElementNS(that.XULNS, 'menuitem');
        node.setAttribute('label', that.localeFormat('edit_existing', [cobj.extension]));
        that.listen(node, 'command', that.hitch(that, 'menuExtEdit', null, false), false);
        node.setAttribute('disabled', is_disabled?'true':'false');
        menu.insertBefore(node, magic_stop_node);
    }

    // Insert the new magic bits
    for (i = 0; i < exts.length; i++) {
        node = document.createElementNS(that.XULNS, 'menuitem');
        node.setAttribute('label', that.localeFormat('edit_ext', [exts[i]]));
        (function () {
            var ext = exts[i];
            that.listen(node, 'command', that.hitch(that, 'menuExtEdit', ext, true), false);
        })();
        node.setAttribute('disabled', is_disabled?'true':'false');
        menu.insertBefore(node, magic_stop_node);
    }
    return menu;
};

/**
 * Returns the locale object for translation.
 */
ItsAllText.prototype.getLocale = function () {
    var string_bundle = Components.classes["@mozilla.org/intl/stringbundle;1"],
        obj = string_bundle.getService(Components.interfaces.nsIStringBundleService);
    /**
     * A localization bundle.  Use it like so:
     * ItsAllText.locale.getStringFromName('blah');
     */
    return obj.createBundle("chrome://itsalltext/locale/itsalltext.properties");
};

ItsAllText = new ItsAllText();

