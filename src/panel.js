const debug = false;
debugLog = debug ? console.log.bind(null, "panel.js DEBUG: ") : () => { };

const DESCRIPTION_TEXT_LENGTH = 200;
const TAB_CREATE_ON_CLICK_LINK = false;

tabs = [];

function init() {
    browser.runtime.onMessage.addListener(function (message) {
        if (message.type != "display_related_page") { return }
        debugLog("message", message);
        page_related_display(message.sortedPages, message.sortedTokens);
        scroll_top();
    });

    browser.tabs.query({}).then(_tabs => tabs = _tabs);

    browser.tabs.onRemoved.addListener(() => {
        browser.tabs.query({}).then(_tabs => tabs = _tabs);
    })

    browser.tabs.onCreated.addListener(() => {
        browser.tabs.query({}).then(_tabs => tabs = _tabs);
    })
}
init();

async function page_related_display(sortedPages, sortedTokens) {
    debugLog("display_related_page...");
    const mainDivElement = document.getElementById("main");
    const recomend_elems = []
    const documentFragment = document.createDocumentFragment();
    for (let page of sortedPages) {
        page.isInTab = url_is_on_tab(page.url, tabs);
        const elem = await element_create(page, sortedTokens);
        documentFragment.appendChild(elem);
        recomend_elems.push(elem);
    }

    mainDivElement.innerHTML = "";
    mainDivElement.appendChild(documentFragment);

    const page_delete_all_button = document.createElement("button");
    page_delete_all_button.textContent = "×";
    page_delete_all_button.title = "Remove all page";
    page_delete_all_button.classList.add("page_delete_all_button");
    page_delete_all_button.addEventListener("click", () => {
        recomend_elems.forEach(e => e.classList.add("foldout"));
        pages_delete(sortedPages);
    });
    const ui_list_controll_div = document.createElement("div");
    ui_list_controll_div.classList.add("ui_list_controll");
    ui_list_controll_div.appendChild(page_delete_all_button);
    mainDivElement.appendChild(ui_list_controll_div);

    debugLog("...display_related_page");
}

function url_is_on_tab(url, tabs) {
    if (typeof url != "string") {
        return false;
    }
    return tabs.map(tab => tab.url).includes(url);
}

function html_escape(text) {
    if (typeof text !== 'string') {
        return text;
    }
    return text.replace(/[&'`"<>]/g, function (match) {
        return {
            '&': '&amp;',
            "'": '&#x27;',
            '`': '&#x60;',
            '"': '&quot;',
            '<': '&lt;',
            '>': '&gt;',
        }[match]
    });
}
async function element_create(page, tokens) {
    Test.assert(page.text_content.constructor == String, page.text_content);
    const descriptionText = text_slice_by_token(page.text_content, tokens, DESCRIPTION_TEXT_LENGTH);

    const titleText = page.title.replace(/\n/g, " ");

    const containerElement = document.createElement("div");
    containerElement.classList.add("link");
    containerElement.classList.add("container");
    if (page.isInTab) {
        containerElement.classList.add("isInTab");
    }

    const page_controll_button_container = document.createElement("div");
    page_controll_button_container.classList.add("page_controll_button");
    containerElement.appendChild(page_controll_button_container);

    const delete_button = document.createElement("button");
    delete_button.textContent = "×";
    delete_button.title = "Remove this page";
    delete_button.classList.add("delete_button");
    page_controll_button_container.appendChild(delete_button);

    const bookmark_button = document.createElement("button");
    bookmark_button.classList.add("bookmark_button");
    if (page.isBookmarked) {
        bookmark_button.title = "Unbookmark";
        bookmark_button.classList.add("bookmarked");
    } else {
        bookmark_button.title = "Bookmark";
    }
    page_controll_button_container.append(bookmark_button);

    const urlElement = document.createElement("div");
    urlElement.classList.add("url");
    urlElement.classList.add("no-break");
    urlElement.textContent = page.url;
    containerElement.appendChild(urlElement);

    const linkElement = document.createElement("a");
    linkElement.classList.add("link");
    linkElement.classList.add("no-break");
    linkElement.href = page.url;
    linkElement.title = page.title;
    // const faviconElement = document.createElement("img");
    // faviconElement.classList.add("favicon");
    // faviconElement.loading = "lazy";
    // linkElement.appendChild(faviconElement);
    // if (page.favicon_url) {
    //     faviconElement.src = page.favicon_url;
    // } else {
    //     faviconElement.src = page.url.replace(/(^https?:\/\/(?:.*?)\/)(?:.*?)$/g, "$1favicon.ico");
    // }
    // faviconElement.onerror = () => { faviconElement.src = "" }
    text_bold_set_element_tokens(linkElement, titleText, tokens);
    containerElement.appendChild(linkElement);

    const descriptionElement = document.createElement("div");
    descriptionElement.classList.add("description");
    text_bold_set_element_tokens(descriptionElement, descriptionText, tokens);

    containerElement.appendChild(descriptionElement);

    linkElement.onclick = (e) => {
        if (e.ctrlKey || e.shiftKey) {
            return true;
        }

        tab_activate_with_url(page.url);
        e.preventDefault();

        //リンクを押したときに遷移させたくないけど、ドラッグアンドドロップでブックマークしたい　https://qiita.com/kangyoosam/items/97e74463a84963cc7a80
        return false;
    };

    bookmark_button.onclick = bookmark_swap_function(page, bookmark_button);

    delete_button.onclick = () => {
        debugLog("Removing page...");
        page_delete(page);
        debugLog("Page is removed");
        containerElement.classList.add("foldout");
    }

    return containerElement;
}

function pages_delete(pages) {
    browser.runtime.sendMessage({ pages: pages, pages_delete: true });
}

function page_delete(page) {
    browser.runtime.sendMessage({ page: page, page_delete: true });
}

function bookmark_swap_function(page, bookmark_button) {
    return () => {
        if (page.isBookmarked) {
            debugLog("Removing bookmark...");
            bookmark_remove(page.url);
            page.isBookmarked = false;
            bookmark_button.classList.remove("bookmarked");
            debugLog("Bookmark is removed");
        } else {
            debugLog("Creating bookmark...");
            browser.bookmarks.create({
                title: page.title,
                url: page.url
            });
            page.isBookmarked = true;
            bookmark_button.classList.add("bookmarked");
            debugLog("Bookmark is created");
        }
    }
}

async function bookmark_remove(url) {
    const bookmarks = await browser.bookmarks.search({ url: url });
    for (bookmark of bookmarks) {
        await browser.bookmarks.remove(bookmark.id);
    }
}
Test.test_ブックマークを削除できること = function () {
    (async () => {
        const url = "https://example.com/";
        await browser.bookmarks.create({
            title: "example.com",
            url: url
        });
        let bookmark = await browser.bookmarks.search({ url: url });
        console.assert(bookmark.length > 0, bookmark);
        await bookmark_remove(url);
        bookmark = await browser.bookmarks.search({ url: url });
        console.assert(bookmark.length == 0, bookmark);

        bookmark = await browser.bookmarks.search({ url: url });
        console.assert(bookmark.length == 0, bookmark);
        await bookmark_remove(url);
        bookmark = await browser.bookmarks.search({ url: url });
        console.assert(bookmark.length == 0, bookmark);
    })();
}


function text_bold_set_element_tokens(element, arg_text, tokens) {
    let splittedText = splits(arg_text, tokens);
    for (text of splittedText) {
        if (tokens.indexOf(text) != -1) {
            const boldElement = document.createElement("b");
            boldElement.textContent = text;
            element.appendChild(boldElement);
        } else {
            element.appendChild(document.createTextNode(text));
        }
    }
}

function splits(text, separators) {
    let splittedText = [text];
    for (let separator of separators) {
        const tmp = [];
        for (let text of splittedText) {
            tmpSplittedText = text.split(separator);
            tmp.push(tmpSplittedText[0]);
            for (let i = 1; i < tmpSplittedText.length; i++) {
                const text_split_token = tmpSplittedText[i];
                tmp.push(separator);
                tmp.push(text_split_token);
            }
        }
        splittedText = tmp;
    }
    return splittedText;
}
Test.test_複数の語句でテキストを分割できること = function () {
    const splittedText = splits("asdfalsfjtesta;hogelsfaatestjflsajdf", ["test", "hoge"])
    console.assert(JSON.stringify(splittedText) == JSON.stringify(["asdfalsfj", "test", "a;", "hoge", "lsfaa", "test", "jflsajdf"]), splittedText);
}

async function tab_activate_with_url(url) {
    debugLog("activateTabByUrl url", url);
    const tabs_of_opening_url = (await browser.tabs.query({})).filter(tab => tab.url == url);
    debugLog("activateTabByUrl tabs", tabs_of_opening_url);
    if (tabs_of_opening_url.length > 0) {
        debugLog("activateTabByUrl tabs[0].id", tabs_of_opening_url[0].id)
        browser.tabs.update(tabs_of_opening_url[0].id, {
            active: true
        });
        return
    }

    if (!TAB_CREATE_ON_CLICK_LINK) {
        const activeTabs = await browser.tabs.query({ highlighted: true });
        if (activeTabs.length > 0) {
            browser.tabs.update(activeTabs[0].id, {
                url: url
            }).catch(error => {
                console.error(error);
            });
            return
        }
    }

    debugLog(`activateTabByUrl browser.tabs.create`);
    browser.tabs.create(
        {
            url: url,
            active: true
        }
    )
}


function scroll_top() {
    document.documentElement.scrollTop = 0; // For Chrome, Firefox, IE and Opera
}

function text_match_token_bold(text, tokens) {
    let returnText = text;
    for (token of tokens) {
        returnText = returnText.split(token).join(`<b>${token}</b>`);
    }
    return returnText;
}

function text_slice_by_token(text, tokens, text_length) {
    Test.assert(text != undefined, text);
    let didSlice = false;
    let tmpText = text.replace(/\n/g, " ");
    let tokenIndex = 0;
    for (token of tokens) {
        tokenIndex = tmpText.indexOf(token);
        if (tokenIndex > 0) {
            tmpText = tmpText.slice(Math.max(tokenIndex - 10, 0), Math.max(tokenIndex - 10, 0) + text_length);
            didSlice = true;
            break;
        }
    }

    if (!didSlice) {
        tmpText = text.slice(0, text_length);
    }

    return tmpText;
}
Test.test_トークンに近いところでテキストが取り出せること = function () {
    const text_length = 200;
    const text = "&t_w K#9-EDD2はじめに使い方利用規約設定(2,603,594){2020年11月18日}(1){食事 1646kcal K#9-EDD2/A-28F0}描き直す？2020-11-18 21:132020-11-18 19:48(3){ペペロンチーノ}{ビーフシチュー}{みかん}{希哲14年11月18日の進捗時限}{希哲14年11月18日の進捗}{希哲14年11月18日}{進捗記録}{進捗時限記録}{進捗時限}{進捗}(7){希哲14年11月18日1歩 K#F85E/A-E74C-1B42}宇田川浩行，開始。21時夜のデライト宣伝2020-11-18 21:04{希哲14年11月18日の進捗}{希哲14年11月18日}{進捗記録}{進捗時限記録}{進捗時限}{進捗}(6){希哲14年11月18日の進捗時限 K#F85E/A-E74C-675D}宇田川浩行2020-11-18 21:03(1){希哲14年11月18日1歩}{希哲14年11月18日}{進捗記録}{進捗}(3){希哲14年11月18日の進捗 K#F85E/A-E74C-4896}宇田川浩行2020-11-18 21:02(2){希哲14年11月18日1歩}{希哲14年11月18日の進捗時限}{希哲14年11月}{11月18日}(2){希哲14年11月18日 K#F85E/A-E74C-70FC}宇田川浩行2020-11-18 21:02(3){希哲14年11月18日1歩}{希哲14年11月18日の進捗時限}{希哲14年11月18日の進捗}{食事 1646kcal}{2020年11月18日}(2){ペペロンチーノ K#9-EDD2/A-B8F4}736kcal　 80g→320kcalスパゲッティ 大匙2ぐらい→24g→216kcalオリーブオイル 200kcal?塩豚描き直す？2020-11-18 19:52(3){オリーブオイル}{スパゲッティ}{塩豚}{2020年11月18日 K#9-EDD2/A-A19D}描き直す？2020-11-18 19:48(2){食事 1646kcal}{ペペロンチーノ}{うんち！ K#9-834D/A-E7CA}名無し💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩2020-11-18 12:45{希哲14年11月17日}{『希哲日記』}{日記}(3){希哲14年11月17日の日記 K#F85E/A-E74C-D9D2}宇田川浩行見通しが大分良くなってきた。家族の都合で犬の世話をしなければならなくなり，今日はあちこち粗相をするので大変だったが，よく考えると，これも実はのためになりそうだ。デライト2020-11-17 23:232020-11-17 23:20{希哲14年11月}{11月17日}(2){希哲14年11月17日 K#F85E/A-E74C-96EA}宇田川浩行2020-11-17 23:19(1){希哲14年11月17日の日記}1{}描き出す";
    const tokens = ["drivedropboxboxonedriveadobe", "phonetabletbrowserinvitelog", "clippergoogle", "deviceupload", "installing", "cccustoma", "appapply", "urlsaved", "filesweb", "noeaster", "eggshere", "inthere", "collaboration", "letter", "whiteboard", "lite", "miro", "via", "visual", "online", "システム", "履歴", "自動", "are", "my", "for", "the", "検索"];
    const slicedText = text_slice_by_token(text, tokens, text_length);
    console.assert(slicedText.length <= text_length, { slicedText: slicedText, length: slicedText.length });
}

Test.run();