import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './app.vue';

const app = createApp(App);

function teleportStyle() {
    if ($(`head > div[script_id="${getScriptId()}"]`).length > 0) {
        return;
    }
    const $div = $(`<div>`)
        .attr('script_id', getScriptId())
        .append($(`head > style`, document).clone());
    $('head').append($div);
}

export function initPanel() {
    teleportStyle();

    const $app = $('<div>').attr('script_id', getScriptId());
    // 将我们的设置面板注入到扩展设置区域
    $('#extensions_settings2').append($app);

    app.use(createPinia()).mount($app[0]);
}

function deteleportStyle() {
    $(`head > div[script_id="${getScriptId()}"]`).remove();
}

export function destroyPanel() {
    app.unmount();
    $(`#extensions_settings2 > div[script_id="${getScriptId()}"]`).remove();
    deteleportStyle();
}
