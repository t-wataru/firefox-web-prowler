const debug = false;
debugLog = debug ? console.log.bind(null, 'WEB PROWLER DEBUG: ') : () => {};

debugLog('pagescript');
// setTimeout(requestRegisterPage, 5*1000);

const SCROLL_DELAY_MS = 0.5 * 1000;
const KEYUP_DELAY_MS = 10 * 1000;
const ON_KEYUP_ENABLED = false;
let innerText_before = '';

let keyupTimeout;
if (ON_KEYUP_ENABLED) {
    window.addEventListener('keyup', (event) => {
        clearTimeout(keyupTimeout);
        keyupTimeout = setTimeout(() => {
            debugLog('keyup', event);
            recommend_and_register_request(text_in_html());
        }, KEYUP_DELAY_MS);
    });
}

function recommend_and_register_request(text_request) {
    recommend_request(text_request).then(() => {
        page_register_request(text_request);
    });
}

// window.addEventListener('load', (event) => {
//   debugLog('window.onload');
//   page_register_request(text_in_html());
//   // recommend_request(text_query());
// });

window.addEventListener('focus', function (event) {
    debugLog('window.onfocus');
    innerText_before = '';
    recommend_request.textLines_before = '';
    page_register_request.textLines_before = '';

    recommend_request(text_query()).then(() => {
        page_register_request(text_query());
    });
});

function text_query() {
    const _text_selection = text_selection();
    const _text_query = _text_selection ? _text_selection : text_in_html();
    return _text_query;
}

function text_selection() {
    return window.getSelection().toString();
}

// window.addEventListener('readystatechange', (event) => {
//   debugLog('readystatechanged');
//   page_register_request(text_in_html());
//   // recommend_request(text_query());
// });

let scroll_timeout = 0;
let scroll_value = 0;
window.addEventListener('scroll', function (e) {
    clearTimeout(scroll_timeout);
    scroll_timeout = setTimeout(() => {
        debugLog('scroll');
        const _text_in_html = text_in_html();
        const _text_selection = text_selection();
        recommend_request(_text_selection ? _text_selection : _text_in_html).then(() => {
            page_register_request(_text_in_html);
        });
    }, SCROLL_DELAY_MS);
});

// let scroll_request_recommend_event_timeout = 0;
// window.addEventListener('scroll', function (e) {
//   clearTimeout(scroll_request_recommend_event_timeout);
//   scroll_request_recommend_event_timeout = setTimeout(() => {
//     debugLog("scroll");
//     requestRecommend();
//   }, SCROLL_REQUEST_RECOMMEND_DELAY_MS);
// });

//https://qiita.com/uuuno/items/5a215d9bfeabec8adbc3
window.addEventListener('mouseup', function (e) {
    //mouseupでイベント発火
    var selectedStr;
    if (window.getSelection) {
        //selectionオブジェクト取得
        selectedStr = window.getSelection().toString(); //文章取得
        if (selectedStr !== '' && selectedStr !== '\n') {
            //文章チェック
            recommend_request(selectedStr);
        }
    }
});

const tokenizer = new Tokenizer();
async function message_send_with_token() {
    // const textLines = getTextFromTextNodes();
    const textLines = document.querySelector('html').innerText;
    const tokens = tokenizer.async_tokenize(textLines);
    debugLog('tokens', tokens);
    const message = { url: location.href, innerText: textLines, title: document.title, tokens: tokens };
    debugLog('message', message);
    browser.runtime.sendMessage(message);
}

async function page_register_request(textLines) {
    if (textLines == '') {
        return;
    }
    if (page_register_request.textLines_before.length == textLines.length) {
        return;
    }

    page_register_request.textLines_before = textLines;
    const message = { page: { url: location.href, text_content: textLines, title: document.title, favicon_url: favicon_url() }, type: 'register' };
    debugLog('message', message);
    browser.runtime.sendMessage(message);
    links_register_request();
}
page_register_request.textLines_before = '';

function favicon_url() {
    const favicon_url = document.querySelector("link[rel~='icon']")?.href;
    return favicon_url;
}

function links_register_request() {
    debugLog('requestRegisterLinks...');
    const a_elem_by_url = new Map();
    for (a of document.getElementsByTagName('a')) {
        if (
            a.href &&
            !links_register_request.urls.has(a.href) &&
            a.href.includes('http') &&
            a.innerText &&
            !a.classList.toString().includes('button') &&
            !a.id.includes('button') &&
            !a.href.includes('search')
        ) {
            links_register_request.urls.add(a.href);
            a_elem_by_url.set(a.href, a);
        }
        if (a_elem_by_url.size > 300) {
            break;
        }
    }
    debugLog('a_elem_by_url', a_elem_by_url);

    const pages = Array.from(a_elem_by_url.values()).map((a) => {
        const linkText = a.textContent.replace(/\n|\s/g, ' ').replace(/\s+/g, ' ');
        return { url: a.href, text_content: '', title: linkText };
    });
    console.assert(pages, pages);
    const message = { pages: pages, type: 'registers' };
    debugLog('message', message);
    browser.runtime.sendMessage(message);
}
links_register_request.urls = new Set();

function recommend_request(text_request) {
    if (text_request == '') {
        return;
    }
    if (recommend_request.textLines_before.length == text_request.length) {
        return;
    }

    recommend_request.textLines_before = text_request;
    const message = { page: { url: location.href, text_request: text_request }, type: 'recommend' };
    debugLog('message', message);
    return browser.runtime.sendMessage(message);
}
recommend_request.textLines_before = '';

function text_from_text_nodes_within_viewport() {
    const elems = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6,a,p,span,article')).filter(element_is_in_viewport);
    const textLines = elems
        .map((e) => Array.from(e.childNodes))
        .reduce((a, b) => a.concat(b))
        .filter((n) => n.nodeType == 3)
        .map((n) => n.nodeValue)
        .join('')
        .replace(/\s+|\n+/g, ' ')
        .replace(/\s+/g, ' ');
    return textLines;
}

/**
 * from: https://stackoverflow.com/questions/123999/how-can-i-tell-if-a-dom-element-is-visible-in-the-current-viewport
 * @param {*} el
 */
function element_is_in_viewport(el) {
    // Special bonus for those using jQuery
    if (typeof jQuery === 'function' && el instanceof jQuery) {
        el = el[0];
    }

    var rect = el.getBoundingClientRect();

    return (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) /* or $(window).height() */ &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth) /* or $(window).width() */
    );
}

function text_from_text_nodes() {
    const textLines = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6,a,p,span,article'))
        .map((e) => Array.from(e.childNodes))
        .reduce((a, b) => a.concat(b))
        .filter((n) => n.nodeType == 3)
        .map((n) => n.nodeValue)
        .join('')
        .replace(/\s+|\n+/g, ' ')
        .replace(/\s+/g, ' ');
    return textLines;
}
function text_in_html() {
    const title = document.querySelector('title').innerText;
    const og_contents = Array.from(document.querySelectorAll("meta[property*='og'"))
        .map((og) => og.content)
        .join(' ');
    const innerText = document.querySelector('body').innerText;
    const textLines = (innerText + og_contents + title).replace(/\s+|\n+/g, ' ').replace(/\s+/g, ' ');
    return textLines;
}
