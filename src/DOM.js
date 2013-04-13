/*!
 * DOM.js (https://github.com/chemerisuk/DOM.js)
 * Modern javascript library for working with DOM
 *
 * Copyright (c) 2013 Maksim Chemerisuk
 */
(function(window, document, slice, undefined) {
    "use strict";

    var DOM,
        htmlEl = document.documentElement,
        headEl = document.head,
        scripts = document.scripts,
        vendorPrefix = (function() {
            var computed = window.getComputedStyle(htmlEl, "");

            return (slice.call(computed).join("").match(/moz|webkit|ms/)||(computed.OLink===""&&["o"]))[0];
        })(),
        // helpers
        extend = function(proto, name, value) {
            if (arguments.length === 3) {
                Object.defineProperty(proto, name, {
                    value: value,
                    enumerable: true
                });
            } else {
                Object.keys(name).forEach(function(key) {
                    extend(proto, key, name[key]);
                });
            }

            return proto;
        },
        makeArgumentsError = function(methodName, type) {
            // http://domjs.net/doc/{objectName}/{methodName}[#{hashName}]
            return "Error: '" + (type ? type + "." : "") + methodName + "' method called with illegal arguments";
        },
        // types
        DOMNode = function(node) {
            if (!(this instanceof DOMNode)) {
                return node ? node.__dom__ || new DOMNode(node) : new DOMNullNode();
            }

            if (node) {
                node.__dom__ = Object.defineProperties(this, {
                    _node: { value: node },
                    // private data objects
                    _data: { value: {} },
                    _events: { value: [] }
                }); 
            }
        },
        DOMElement = function(el) {
            if (!(this instanceof DOMElement)) {
                return el ? el.__dom__ || new DOMElement(el) : new DOMNullElement();
            }

            DOMNode.call(this, el);
        },
        DOMNullNode = function() { this._node = null; },
        DOMNullElement = function() { this._node = null; },
        DOMElementCollection = (function() {
            // Create clean copy of Array prototype. Inspired by
            // http://dean.edwards.name/weblog/2006/11/hooray/
            var ref = scripts[0],
                iframe = document.createElement("iframe"),
                ctr, proto;
                
            iframe.src = "about:blank";
            iframe.style.display = "none";
                
            ref.parentNode.insertBefore(iframe, ref);
            // store reference to clean Array
            ctr = iframe.contentWindow.Array;
            // cleanup DOM
            ref.parentNode.removeChild(iframe);

            proto = ctr.prototype;
            // cleanup collection prototype
            Object.getOwnPropertyNames(proto).forEach(function(methodName) {
                ~"forEach map every some filter length reduce reduceRight".indexOf(methodName) || delete proto[methodName];
            });
            // shortcuts
            "set on off capture fire data addClass removeClass toggleClass".split(" ").forEach(function(methodName) {
                var process = function(el) {
                    el[methodName].apply(el, this);
                };

                extend(proto, methodName, function() {
                    if (this.length > 0) {
                        this.forEach(process, slice.call(arguments));
                    }

                    return this;
                });
            });
            
            return ctr;
        })(),
        SelectorMatcher = (function() {
            // Quick matching inspired by
            // https://github.com/jquery/jquery
            var rquickIs = /^(\w*)(?:#([\w\-]+))?(?:\[([\w\-]+)\])?(?:\.([\w\-]+))?$/,
                ctr =  function(selector, quickOnly) {
                    this.selector = selector;
                    this.quickOnly = !!quickOnly;

                    var quick = rquickIs.exec(selector);
                    // TODO: support attribute value check
                    if (this.quick = quick) {
                        //   0  1    2   3          4
                        // [ _, tag, id, attribute, class ]
                        quick[1] && (quick[1] = quick[1].toLowerCase());
                        quick[4] && (quick[4] = " " + quick[4] + " ");
                    } else if (quickOnly) {
                        throw makeArgumentsError("quick");
                    }
                },
                matchesProp = htmlEl.matchesSelector ? "matchesSelector" : vendorPrefix + "MatchesSelector";

            ctr.prototype = {
                test: function(el) {
                    if (this.quick) {
                        return (
                            (!this.quick[1] || el.nodeName.toLowerCase() === this.quick[1]) &&
                            (!this.quick[2] || el.id === this.quick[2]) &&
                            (!this.quick[3] || el.hasAttribute(this.quick[3])) &&
                            (!this.quick[4] || !!~((" " + el.className  + " ").indexOf(this.quick[4])))
                        );
                    }

                    return !this.quickOnly && el[matchesProp](this.selector);
                }
            };

            return ctr;
        })(),
        DOMEvent = function(event) {
            if (!(this instanceof DOMEvent)) {
                return event.__dom__ || ( event.__dom__ = new DOMEvent(event) );
            }

            this._event = event;
        };

    DOMNode.prototype = extend({}, {
        find: (function() {
            // big part of code is stoled from Sizzle:
            // https://github.com/jquery/sizzle/blob/master/sizzle.js

            // TODO: disallow to use buggy selectors
            var rquickExpr = /^(?:#([\w\-]+)|(\w+)|\.([\w\-]+))$/,
                rsibling = /[\x20\t\r\n\f]*[+~>]/,
                rescape = /'|\\/g,
                expando = "DOM" + new Date().getTime();

            return function(selector, /*INTERNAL*/multiple) {
                if (typeof selector !== "string") {
                    throw makeArgumentsError("find");
                }

                var node = this._node, m, elem, 
                    match = rquickExpr.exec(selector),
                    elements = multiple ? [] : null;

                if (match) {
                    // Speed-up: "#ID"
                    if (m = match[1]) {
                        elem = document.getElementById(m);
                        // Handle the case where IE, Opera, and Webkit return items
                        // by name instead of ID
                        if ( elem && elem.parentNode && elem.id === m && (node === document || this.contains(elem)) ) {
                            elements = [elem];
                        }
                    // Speed-up: "TAG"
                    } else if (match[2]) {
                        elements = node.getElementsByTagName(selector);
                    // Speed-up: ".CLASS"
                    } else if (m = match[3]) {
                        elements = node.getElementsByClassName(m);
                    }

                    if (elements && !multiple) {
                        elements = elements[0];
                    }
                } else {
                    var old = true,
                        nid = expando,
                        newContext = node,
                        newSelector = node === document && selector;

                    if (node !== document) {
                        // qSA works strangely on Element-rooted queries
                        // We can work around this by specifying an extra ID on the root
                        // and working up from there (Thanks to Andrew Dupont for the technique)
                        if ( (old = node.getAttribute("id")) ) {
                            nid = old.replace(rescape, "\\$&");
                        } else {
                            node.setAttribute("id", nid);
                        }

                        nid = "[id='" + nid + "'] ";

                        newContext = rsibling.test(selector) && node.parentNode || node;
                        newSelector = nid + selector.replace(/","/g, "," + nid);
                    }

                    if (newSelector) {
                        try {
                            elements = newContext[multiple ? "querySelectorAll" : "querySelector"](newSelector);
                        } finally {
                            if ( !old ) {
                                node.removeAttribute("id");
                            }
                        }
                    }
                }

                return DOM.create(elements);
            };
        })(),
        findAll: function(selector) {
            return this.find(selector, true);
        },
        contains: (function() {
            var containsElement = Node.prototype.contains ?
                function(parent, child) {
                    return parent.contains(child);
                } :
                function(parent, child) {
                    return !!(parent.compareDocumentPosition(child) & 16);
                };

            return function(element, /*INTERNAL*/reverse) {
                var node = this._node;

                if (element instanceof Element) {
                    return containsElement(reverse ? element : node, reverse ? node : element);
                } else if (element instanceof DOMElement) {
                    return element.contains(node, true);
                } else if (Array.isArray(element)) {
                    return element.every(function(element) {
                        if (element instanceof DOMElement) {
                            return element.contains(node, true);
                        }
                        
                        throw makeArgumentsError("contains");
                    });
                } else {
                    throw makeArgumentsError("contains");
                }
            };
        })(),
        on: function(event, callback, capturing) {
            var eventType = typeof event,
                thisPtr = this;

            if (eventType === "string" && typeof callback === "function") {
                var selectorStart = event.indexOf(" "),
                    handleEvent = function(e) {
                        callback.call(thisPtr, DOMEvent(e));
                    },
                    eventEntry = {
                        capturing: !!capturing,
                        nodeEvent: ~selectorStart ? event.substr(0, selectorStart) : event,
                        selector: ~selectorStart ? event.substr(selectorStart + 1) : null,
                        callback: callback, 
                        handler: !~selectorStart ? handleEvent : function(e) {
                            for (var elem = e.target, root = e.currentTarget; elem && elem !== root; elem = elem.parentNode) {
                                if (matcher.test(elem)) {
                                    return handleEvent(e);
                                }
                            }
                        }
                    },
                    matcher = eventEntry.selector ? new SelectorMatcher(eventEntry.selector) : null;
                // fix IE9 focus/blur handlers
                if (this._node.attachEvent) {
                    if (eventEntry.nodeEvent === "focus") {
                        eventEntry.nodeEvent = "focusin";
                    } else if (eventEntry.nodeEvent === "blur") {
                        eventEntry.nodeEvent = "focusout";
                    }
                }
                // attach event listener
                this._node.addEventListener(eventEntry.nodeEvent, eventEntry.handler, eventEntry.capturing);
                // store event entry
                this._events.push(eventEntry);
            } else if (Array.isArray(event)) {
                event.forEach(function(key) {
                    this.on(key, callback);
                }, this);
            } else if (eventType === "object") {
                Object.keys(event).forEach(function(key) {
                    this.on(key, event[key]);
                }, this);
            } else {
                throw makeArgumentsError("on");
            }

            return this;
        },
        off: function(event, callback) {
            if (typeof event !== "string" || callback !== undefined && typeof callback !== "function") {
                throw new makeArgumentsError("off");
            }

            var selectorStart = event.indexOf(" "),
                nodeEvent = ~selectorStart ? event.substr(0, selectorStart) : event,
                selector = ~selectorStart ? event.substr(selectorStart + 1) : null;

            this._events.forEach(function(entry) {
                if (nodeEvent === entry.nodeEvent && (!callback || (selector === entry.selector && callback === entry.callback))) {
                    // remove event listener from the element
                    this._node.removeEventListener(nodeEvent, entry.handler, entry.capturing);
                }
            }, this);

            return this;
        },
        fire: function(eventType, detail) {
            if (typeof eventType !== "string") {
                throw new makeArgumentsError("fire");
            }

            var isCustomEvent = ~eventType.indexOf(":"),
                event = document.createEvent(isCustomEvent ? "CustomEvent" : "Event");

            if (isCustomEvent) {
                event.initCustomEvent(eventType, true, false, detail);
            } else {
                event.initEvent(eventType, true, true);
            }
            
            this._node.dispatchEvent(event);

            return this;
        },
        call: function(name) {
            if (arguments.length === 1) {
                return this._node[name]();
            } else {
                return this._node[name].apply(this._node, slice.call(arguments, 1));
            }
        },
        data: function(name, value) {
            if (typeof name !== "string") {
                throw makeArgumentsError("data");
            }

            var node = this._node, 
                result = this;

            if (value === undefined) {
                result = this._data[name];

                if (result === undefined && node.hasAttribute("data-" + name)) {
                    result = this._data[name] = node.getAttribute("data-" + name);
                }
            } else {
                this._data[name] = value;
            }

            return result;
        }
    });

    DOMElement.prototype = extend(new DOMNode(), {
        matches: function(selector) {
            if (typeof selector !== "string") {
                throw makeArgumentsError("matches");
            }

            return new SelectorMatcher(selector).test(this._node);
        },
        clone: function() {
            return new DOMElement(this._node.cloneNode(true));
        },
        css: function(property, value) {
            var el = this._node,
                propType = typeof property;

            if (property === undefined) {
                return window.getComputedStyle(el);
            }

            if (propType === "string") {
                if (value === undefined) {
                    return el.style[property] || window.getComputedStyle(el)[property];
                }

                el.style[property] = value;
            } else if (propType === "object") {
                Object.keys(property).forEach(function(key) {
                    this.css(key, property[key]);
                }, this);
            } else {
                throw makeArgumentsError("css");
            }

            return this;
        },
        html: (function() {
            var processScripts = function(el) {
                if (el.src) {
                    var script = document.createElement("script");

                    script.src = el.src;

                    headEl.removeChild(headEl.appendChild(script));
                } else {
                    eval(el.textContent);
                }
            };

            return function(value) {
                var el = this._node;

                if (value === undefined) {
                    return el.innerHTML;
                }

                if (typeof value !== "string") {
                    throw makeArgumentsError("html");
                }
                // fix NoScope elements in IE
                el.innerHTML = "&shy;" + value;
                el.removeChild(el.firstChild);
                // fix script elements
                slice.call(el.getElementsByTagName("script")).forEach(processScripts);

                return this;
            };
        })(),
        offset: function() {
            var bodyEl = document.body,
                boundingRect = this._node.getBoundingClientRect(),
                clientTop = htmlEl.clientTop || bodyEl.clientTop || 0,
                clientLeft = htmlEl.clientLeft || bodyEl.clientLeft || 0,
                scrollTop = window.pageYOffset || htmlEl.scrollTop || bodyEl.scrollTop,
                scrollLeft = window.pageXOffset || htmlEl.scrollLeft || bodyEl.scrollLeft;

            return {
                top: boundingRect.top + scrollTop - clientTop,
                left: boundingRect.left + scrollLeft - clientLeft,
                right: boundingRect.right + scrollLeft - clientLeft,
                bottom: boundingRect.bottom + scrollTop - clientTop
            };
        },
        show: function() {
            return this.set("hidden", false);
        },
        hide: function() {
            return this.set("hidden", true);
        }
    });

    // getter/setter
    (function(protectedNames) {
        extend(DOMElement.prototype, {
            get: function(name) {
                if (typeof name !== "string" || name in protectedNames) {
                    throw makeArgumentsError("get");
                }

                var el = this._node;

                return el[name] || el.getAttribute(name);
            },
            set: function(name, value) {
                var el = this._node,
                    nameType = typeof name,
                    valueType = typeof value;

                if (nameType === "string" && !(name in protectedNames)) {
                    if (valueType === "function") {
                        value = value.call(this, this.get(name));
                    }

                    if (value === null || value === false) {
                        el.removeAttribute(name);
                    } else if (name in el) {
                        el[name] = value;
                    } else {
                        el.setAttribute(name, value);
                    } 
                } else if (Array.isArray(name)) {
                    name.forEach(function(name) {
                        this.set(name, value);
                    }, this);
                } else if (nameType === "object") {
                    Object.keys(name).forEach(function(key) {
                        this.set(key, name[key]);
                    }, this);
                } else {
                    throw makeArgumentsError("set");
                }

                return this;
            }
        });
    })({
        children: true,
        childNodes: true,
        firstChild: true,
        lastChild: true,
        nextSibling: true,
        previousSibling: true,
        firstElementChild: true,
        lastElementChild: true,
        nextElementSibling: true,
        previousElementSibling: true,
        parentNode: true,
        elements: true
    });

    // dom traversing strategies
    (function(traversingStrategies) {
        Object.keys(traversingStrategies).forEach(function(methodName) {
            var propertyName = traversingStrategies[methodName];

            if (methodName === "children") {
                extend(DOMElement.prototype, methodName, function(selector) {
                    var children = this._node.children,
                        matcher = selector ? new SelectorMatcher(selector) : null;

                    return DOM.create(!matcher ? slice.call(children) : Array.prototype.filter.call(children, function(el) {
                        return matcher.test(el);
                    }));
                });                
            } else {
                extend(DOMElement.prototype, methodName, function(selector) {
                    var matcher = selector ? new SelectorMatcher(selector) : null,
                        nodes = ~methodName.lastIndexOf("All") ? [] : null,
                        it = this._node;

                    while (it = it[propertyName]) {
                        if (!matcher || matcher.test(it)) {
                            if (!nodes) {
                                return DOMElement(it);
                            }

                            nodes.push(it);
                        }
                    }

                    return DOM.create(nodes);
                });
            }
        });
    })({
        nextAll: "nextElementSibling",
        prevAll: "previousElementSibling",
        children: "children",
        firstChild: "firstElementChild",
        lastChild: "lastElementChild",
        next: "nextElementSibling",
        prev: "previousElementSibling",
        parent: "parentNode"
    });

    // dom manipulation strategies
    (function() {
        // http://www.w3.org/TR/domcore/
        // 5.2.2 Mutation methods
        var manipulationStrategies = {
            after: function(node, relatedNode, parent) {
                parent.insertBefore(relatedNode, node.nextSibling);
            },
            before: function(node, relatedNode, parent) {
                parent.insertBefore(relatedNode, node);
            },
            replace: function(node, relatedNode, parent) {
                parent.replaceChild(node, relatedNode);
            },
            append: function(node, relatedNode) {
                node.appendChild(relatedNode);
            },
            prepend: function(node, relatedNode) {
                node.insertBefore(relatedNode, node.firstChild);
            },
            remove: function(node, parent) {
                parent.removeChild(node);
            }
        };

        Object.keys(manipulationStrategies).forEach(function(methodName) {
            var process = manipulationStrategies[methodName];

            extend(DOMElement.prototype, methodName, function(element, /*INTERNAL*/reverse) {
                var el = this._node,
                    parent = el.parentNode, 
                    relatedNode;

                if (typeof element === "string") {
                    relatedNode = document.createElement("div");
                    relatedNode.innerHTML = element;
                    relatedNode = relatedNode.firstElementChild;
                } else if (element.nodeType === 1 || element.nodeType === 11) {
                    relatedNode = element;
                } else { 
                    // indicate case with remove() function
                    relatedNode = parent;
                }

                if (relatedNode) {
                   process(el, relatedNode, parent);
                } else {
                    throw makeArgumentsError(methodName);
                }

                return this;
            });
        });
    })();

    // classes manipulation
    (function() {
        var rclass = /[\n\t\r]/g,
            classStrategies = htmlEl.classList ? {
                hasClass: function(className) {
                    return this._node.classList.contains(className);
                },
                addClass: function(className) {
                    this._node.classList.add(className);
                },
                removeClass: function(className) {
                    this._node.classList.remove(className);
                },
                toggleClass: function(className) {
                    this._node.classList.toggle(className);
                }
            } : {
                hasClass: function(className) {
                    return !!~((" " + this._node.className + " ")
                            .replace(rclass, " ")).indexOf(" " + className + " ");
                },
                addClass: function(className) {
                    if (!classStrategies.hasClass.call(this, className)) {
                        this._node.className += " " + className;
                    }
                },
                removeClass: function(className) {
                    this._node.className = (" " + this._node.className + " ")
                        .replace(rclass, " ").replace(" " + className + " ", " ").trim();
                },
                toggleClass: function(className) {
                    var oldClassName = this._node.className;

                    classStrategies.addClass.call(this, className);

                    if (oldClassName === this._node.className) {
                        classStrategies.removeClass.call(this, className);
                    }
                }
            };

        Object.keys(classStrategies).forEach(function(methodName) {
            var process = classStrategies[methodName],
                arrayMethodName = methodName === "hasClass" ? "every" : "forEach";

            extend(DOMElement.prototype, methodName, function(classNames) {
                if (typeof classNames !== "string") {
                    throw makeArgumentsError(name);
                }

                var result = classNames.split(" ")[arrayMethodName](process, this);

                return result === undefined ? this : result;
            });
        });
    })();

    DOMEvent.prototype = extend({}, {
        get: function(name) {
            if (typeof name !== "string" || ~name.indexOf("arget") || ~name.indexOf("lement")) {
                throw makeArgumentsError("get", "DOMEvent");
            }

            return this._event[name];
        }
    });
    // methods
    "preventDefault stopPropagation stopImmediatePropagation".split(" ").forEach(function(key) {
        extend(DOMEvent.prototype, key, function() {
            this._event[key]();
        });
    });
    // getters
    "target currentTarget relatedTarget".split(" ").forEach(function(key) {
        Object.defineProperty(DOMEvent.prototype, key, {
            enumerable: true,
            get: function() {
                return DOMElement(this._event[key]);
            }
        });
    });

    // null object types
    DOMNullNode.prototype = new DOMNode();
    DOMNullElement.prototype = new DOMElement();

    Object.keys(DOMNode.prototype).forEach(function(key) {
        extend(DOMNullNode.prototype, key, function() {});
        extend(DOMNullElement.prototype, key, function() {});
    });

    Object.keys(DOMElement.prototype).forEach(function(key) {
        extend(DOMNullElement.prototype, key, function() {});
    });

    // fix constructor property
    [DOMNode, DOMElement, DOMEvent, DOMNullNode, DOMNullElement].forEach(function(ctr) {
        ctr.prototype.constructor = ctr;
    });

    // publi API
    DOM = window.DOM = extend(new DOMNode(document), {
        create: (function() {
            var rcollection = /^\[object (HTMLCollection|NodeList)\]$/,
                newCollection = DOMElementCollection.prototype.map;
            // use Array.prototype implementation to return regular array for map
            DOMElementCollection.prototype.map = Array.prototype.map;

            return function(content) {
                var elem = null;

                if (typeof content === "string") {
                    if (~content.indexOf("<")) {
                        elem = document.createElement("div");
                        elem.innerHTML = content;

                        return newCollection.call(slice.call(elem.children), DOMElement);
                    } else {
                        elem = document.createElement(content);
                    }
                } else if (content instanceof Element) {
                    elem = content;
                } else if (rcollection.test(content) || Array.isArray(content)) {
                    return newCollection.call(content, DOMElement);
                } else if (content) {
                    throw makeArgumentsError("create");
                }

                return DOMElement(elem);
            };
        })(),
        ready: (function() {
            var readyCallbacks = null,
                readyProcess = function() {
                    if (readyCallbacks) {
                        // trigger callbacks
                        readyCallbacks.forEach(function(callback) {
                            callback();
                        });
                        // cleanup
                        readyCallbacks = null;
                    }
                };

            // Catch cases where ready is called after the browser event has already occurred.
            // IE10 and lower don't handle "interactive" properly... use a weak inference to detect it
            // hey, at least it's not a UA sniff
            // discovered by ChrisS here: http://bugs.jquery.com/ticket/12282#comment:15
            if ( document.attachEvent ? document.readyState !== "complete" : document.readyState === "loading") {
                readyCallbacks = [];

                document.addEventListener("DOMContentLoaded", readyProcess, false);
                // additional handler for complex cases
                window.addEventListener("load", readyProcess, false);
            }

            // return implementation
            return function(callback) {
                if (typeof callback !== "function") {
                    throw makeArgumentsError("ready");
                }

                if (readyCallbacks) {
                    readyCallbacks.push(callback);
                } else {
                    callback();
                }
            };
        })(),
        importStyles: (function() {
            var styleEl = headEl.insertBefore(document.createElement("style"), headEl.firstChild),
                computed = window.getComputedStyle(htmlEl, ""),
                process = function(selector, styles) {
                    var ruleText = selector + " { ";

                    if (typeof styles === "object") {
                        Object.keys(styles).forEach(function(styleName) {
                            var prefixed = (vendorPrefix + styleName.charAt(0).toUpperCase() + styleName.substr(1) in computed);
                            // append vendor prefix if it's required
                            ruleText += (prefixed ? "-" + vendorPrefix + "-" : "") + styleName + ":" + styles[styleName] + "; ";
                        });
                    } else if (typeof styles === "string") {
                        ruleText += styles;
                    } else {
                        throw makeArgumentsError("importStyles");
                    }

                    styleEl.appendChild(document.createTextNode(ruleText + "}"));
                };

            if (!("hidden" in htmlEl)) {
                process("[hidden]", "display:none");    
            }
                        
            return function(selector, styles) {
                var selectorType = typeof selector;

                if (selectorType === "string") {
                    process(selector, styles);
                } else if (selectorType === "object") {
                    slice.call(arguments).forEach(function(rule) {
                        var selector = Object.keys(rule)[0];

                        process(selector, rule[selector]);
                    });
                } else {
                    throw makeArgumentsError("importStyles");
                }
            };
        })(),
        watch: htmlEl.addBehavior ? (function() {
            var behavior = scripts[scripts.length - 1].getAttribute("src"),
                watch = function(selector, callback) {
                    var entry = watch._listeners[selector];

                    if (entry) {
                        entry.push(callback);
                    } else {
                        watch._listeners[selector] = [callback];
                        // append style rule at the last step
                        DOM.importStyles(selector, { behavior: behavior });
                    }
                };

            behavior = "url(" + behavior.substr(0, behavior.lastIndexOf(".")) + ".htc)";

            watch._listeners = {};
            
            return watch;
        })() : (function() {
            // use trick discovered by Daniel Buchner: 
            // https://github.com/csuwldcat/SelectorListener
            var startNames = ["animationstart", "oAnimationStart", "MSAnimationStart", "webkitAnimationStart"],
                keyframes = !!(window.CSSKeyframesRule || window[("WebKit|Moz|MS|O").match(new RegExp("(" + vendorPrefix + ")", "i"))[1] + "CSSKeyframesRule"]);

            return function(selector, callback) {
                var animationName = "DOM-" + new Date().getTime(),
                    cancelBubbling = function(e) {
                        if (e.animationName === animationName) {
                            e.stopPropagation();
                        }
                    };

                DOM.importStyles(
                    "@" + (keyframes ? "-" + vendorPrefix + "-" : "") + "keyframes " + animationName,
                    "from { clip: rect(1px, auto, auto, auto) } to { clip: rect(0px, auto, auto, auto) }"
                );

                DOM.importStyles(selector, {
                    "animation-duration": "0.001s",
                    "animation-name": animationName + " !important"
                });

                startNames.forEach(function(name) {
                    document.addEventListener(name, function(e) {
                        var el = e.target;

                        if (e.animationName === animationName) {
                            callback(DOMElement(el));
                            // prevent double initialization
                            el.addEventListener(name, cancelBubbling, false);
                        }
                    }, false);
                });
            };
        })(),
        extend: function(selector, options) {
            if (!options || typeof options !== "object") {
                throw makeArgumentsError("extend");
            }

            var mixins = {}, 
                template = options.template,
                css = options.css;

            if (template) {
                Object.keys(template).forEach(function(key) {
                    var el = document.createElement("div"),
                        fragment = document.createDocumentFragment();

                    el.innerHTML = template[key];

                    for (var node = el.firstElementChild; node; node = node.nextElementSibling) {
                        fragment.appendChild(node);
                    }

                    template[key] = fragment;
                });

                delete options.template;
            }

            if (css) {
                DOM.importStyles.apply(DOM, css);

                delete options.css;
            }

            Object.keys(options).forEach(function(key) {
                if (key !== "constructor") {
                    mixins[key] = {
                        value: options[key],
                        enumerable: true
                    };
                }
            });

            DOM.watch(selector, function(el) {
                Object.defineProperties(el, mixins);

                template && Object.keys(template).forEach(function(key) {
                    el[key](template[key].cloneNode(true));
                });

                if (options.hasOwnProperty("constructor")) {
                    options.constructor.call(el);
                }
            });
        }
    });

})(window, document, Array.prototype.slice);