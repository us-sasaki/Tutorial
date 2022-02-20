(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        // AMD. Register as an anonymous module.
        define(['exports', 'b'], factory);
    } else if (typeof exports === 'object' && typeof exports.nodeName !== 'string') {
        // CommonJS
        factory(exports, require('b'));
    } else {
        // Browser globals
        factory((root.commonJsStrict = {}), root.b);
    }
}(this, function (exports, b) {
    //use b in some fashion.

    // attach properties to the exports object to define
    // the exported module properties.
    exports.Person = void 0;
    class Person {
        constructor(name) {
            this.name = name;
        }
        call() {
            return this.name;
        }
        testPerson() {
            return "test";
        }
    }
    exports.Person = Person;
}));
//# sourceMappingURL=index.js.map
