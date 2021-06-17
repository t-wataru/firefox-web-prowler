class Test {
    static run() {
        if (!this.ENABLE) {
            return;
        }
        const keys = Object.keys(this);
        const tests = keys
            .filter((key) => key.includes('test'))
            .map((key) => this[key])
            .filter((test) => test.constructor == Function || test.constructor.constructor == Function)
            .sort(Math.random);
        for (let test of tests) {
            test();
        }
    }
}
Test.ENABLE = true;
Test.log = Test.ENABLE ? console.log.bind(null, 'TEST:') : () => {};
Test.assert = Test.ENABLE ? console.assert.bind(null) : () => {};

Test.test_テストクラスのテスト関数を失敗させるテスト = function () {
    Test.assert(false, 'これが失敗してエラーになれば、ちゃんとテストが実行されている');
};
Test.test_テストクラスのテスト関数を成功させるテスト = function () {
    Test.assert(true, 'これが失敗してエラーになれば、テスト関数がバグってる');
};
