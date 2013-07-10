define(["DOM", "Element"], function(DOM, $Element, _slice, _foldl, _some, _defer, _forEach, _uniqueId, _getComputedStyle, _forOwn, SelectorMatcher, documentElement) {
    "use strict";

    // WATCH CALLBACK
    // --------------

    /**
     * Execute callback when element with specified selector matches
     * @memberOf DOM
     * @param {String} selector css selector
     * @param {Fuction} callback event handler
     * @param {Boolean} [once] execute callback only at the first time
     * @function
     */
    DOM.watch = (function() {
        var watchers, computed, cssPrefix, scripts, behaviorUrl;

        if (window.CSSKeyframesRule || !document.attachEvent) {
            // Inspired by trick discovered by Daniel Buchner:
            // https://github.com/csuwldcat/SelectorListener
            computed = _getComputedStyle(documentElement);
            cssPrefix = window.CSSKeyframesRule ? "" : (_slice(computed).join().match(/-(moz|webkit)-/) || (computed.OLink === "" && ["-o-"]))[0];
            watchers = {};

            _forEach(["animationstart", "oAnimationStart", "webkitAnimationStart"], function(name) {
                document.addEventListener(name, function(e) {
                    var entry = watchers[e.animationName],
                        node = e.target;

                    if (entry) {
                        // MUST cancelBubbling first otherwise may have extra calls in firefox
                        if (entry.once) node.addEventListener(name, entry.once, false);

                        entry.callback($Element(node));
                    }
                }, false);
            });

            return function(selector, callback, once) {
                var animationName = _uniqueId("DOM"),
                    animations = [animationName];

                _forOwn(watchers, function(entry, key) {
                    if (entry.selector === selector) animations.push(key);
                });

                DOM.importStyles("@" + cssPrefix + "keyframes " + animationName, "1% {opacity: .99}");

                DOM.importStyles(selector, {
                    "animation-duration": "1ms",
                    "animation-name": animations.join() + " !important"
                });

                watchers[animationName] = {
                    selector: selector,
                    callback: callback,
                    once: once && function(e) {
                        if (e.animationName === animationName) e.stopPropagation();
                    }
                };
            };
        } else {
            scripts = document.scripts;
            behaviorUrl = scripts[scripts.length - 1].getAttribute("data-htc");
            watchers = [];

            document.attachEvent("ondataavailable", function() {
                var e = window.event,
                    node = e.srcElement;

                if (e.srcUrn === "dataavailable") {
                    _forEach(watchers, function(entry) {
                        // do not execute callback if it was previously excluded
                        if (_some(e.detail, function(x) { return x === entry.callback; })) return;

                        if (entry.matcher.test(node)) {
                            if (entry.once) node.attachEvent("on" + e.type, entry.once);

                            _defer(function() { entry.callback($Element(node)); });
                        }
                    });
                }
            });

            return function(selector, callback, once) {
                var behaviorExists = _some(watchers, function(x) { return x.matcher.selector === selector; });
                
                if (behaviorExists) {
                    // call the callback manually for each matched element
                    // because the behaviour is already attached to selector
                    // also execute the callback safely
                    DOM.findAll(selector).each(function(el) {
                        _defer(function() { callback(el); });
                    });
                }

                watchers.push({
                    callback: callback,
                    matcher: new SelectorMatcher(selector),
                    once: once && function() {
                        var e = window.event;

                        if (e.srcUrn === "dataavailable") {
                            (e.detail = e.detail || []).push(callback);
                        }
                    }
                });

                if (!behaviorExists) DOM.importStyles(selector, {behavior: "url(" + behaviorUrl + ")"});
            };
        }
    }());
});
