(function (factory) {
    if (typeof module === "object" && typeof module.exports === "object") {
        var v = factory(require, exports);
        if (v !== undefined) module.exports = v;
    }
    else if (typeof define === "function" && define.amd) {
        define(["require", "exports"], factory);
    }
})(function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
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
});
//# sourceMappingURL=index.js.map