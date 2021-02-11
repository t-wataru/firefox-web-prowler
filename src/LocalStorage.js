/*
 * Require localforage: https://localforage.github.io/localForage/#installation
 */
class LocalStorage {
    static async saveItem(key, value) {
        await localforage.setItem(key, value);
    }
    static async loadItem(key) {
        const item = await localforage.getItem(key);
        return item;
    }
    static async keys() {
        return await localforage.keys();
    }
    static async delete(key) {
        return await localforage.removeItem(key);
    }
}
Test.test_LocalStorageでデータを保存できること = function () {
    (async () => {
        const key = "key_text_test";
        const value = "value text";
        await LocalStorage.saveItem(key, value)

        const result_loadItem = await LocalStorage.loadItem(key);
        console.assert(result_loadItem == value, result_loadItem);

        await LocalStorage.delete(key);

        const result_after_delete = await LocalStorage.loadItem(key);
        console.assert(result_after_delete == null, result_after_delete);

        const keys = await LocalStorage.keys();
        console.assert(!keys.includes(key), keys);
    })();
}
Test.test_LocalStorageでオブジェクトを保存できること = function () {
    (async () => {
        const key = "obj_test";
        const value = { text: "value text" };
        await LocalStorage.saveItem(key, value)
        const result = await LocalStorage.loadItem(key);
        console.assert(result.text === value.text, result);
    })();
}
Test.test_LocalStorageででかいオブジェクトを保存できること = function () {
    (async () => {
        const key = "big_obj_test";
        const value = { text: "value text".repeat(1000) };
        await LocalStorage.saveItem(key, value)
        const result = await LocalStorage.loadItem(key);
        console.assert(result.text === value.text, result);
    })();
}