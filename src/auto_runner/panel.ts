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
    try {
        teleportStyle();

        const $container = $('#extensions_settings2');
        if ($container.length === 0) {
            toastr.error('找不到注入点 #extensions_settings2，无法创建界面。', '[AutoRunner] 错误');
            return;
        }

        const $app = $('<div>').attr('script_id', getScriptId());
        $container.append($app);

        app.use(createPinia()).mount($app[0]);
        toastr.success('Auto脚本加载成功');
    } catch (error) {
        console.error('[AutoRunner] 初始化面板时出错:', error);
        toastr.error(`初始化面板时出错: ${(error as Error).message}`, '[AutoRunner] 致命错误');
    }
}

function deteleportStyle() {
    $(`head > div[script_id="${getScriptId()}"]`).remove();
}

export function destroyPanel() {
    app.unmount();
    $(`#extensions_settings2 > div[script_id="${getScriptId()}"]`).remove();
    deteleportStyle();
}
