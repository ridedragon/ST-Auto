import { createApp, App as VueApp } from 'vue';
import { createPinia } from 'pinia';
import App from './app.vue';
import { Settings } from './settings';

function teleportStyle() {
    if ($(`head > div[script_id="${getScriptId()}"]`).length > 0) {
        return;
    }
    const $div = $(`<div>`)
        .attr('script_id', getScriptId())
        .append($(`head > style`, document).clone());
    $('head').append($div);
}

let app: VueApp;

export function initPanel(settings: Settings) {
    try {
        teleportStyle();

        const $container = $('#extensions_settings2');
        if ($container.length === 0) {
            console.error('[AutoRunner] 找不到注入点 #extensions_settings2，无法创建界面。');
            return;
        }

        const $app = $('<div>').attr('script_id', getScriptId());
        $container.append($app);

        app = createApp(App, { settings });
        app.use(createPinia()).mount($app[0]);
    } catch (error) {
        console.error('[AutoRunner] 初始化面板时出错:', error);
        toastr.error(`初始化面板时出错: ${(error as Error).message}`, '[AutoRunner] 致命错误');
    }
}

function deteleportStyle() {
    $(`head > div[script_id="${getScriptId()}"]`).remove();
}

export function destroyPanel() {
    if (app) {
        app.unmount();
    }
    $(`#extensions_settings2 > div[script_id="${getScriptId()}"]`).remove();
    deteleportStyle();
}
