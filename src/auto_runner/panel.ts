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
        toastr.info('[AutoRunner] 开始初始化面板...');
        teleportStyle();

        const $container = $('#extensions_settings2');
        if ($container.length === 0) {
            toastr.error('找不到注入点 #extensions_settings2，无法创建界面。', '[AutoRunner] 错误');
            return;
        }
        toastr.success('成功找到注入点 #extensions_settings2。', '[AutoRunner]');

        const $app = $('<div>').attr('script_id', getScriptId());
        $container.append($app);
        toastr.info('Vue 容器已注入页面。', '[AutoRunner]');

        app.use(createPinia()).mount($app[0]);
        toastr.success('Vue 应用已成功挂载！', '[AutoRunner]');
    } catch (error) {
        console.error('[AutoRunner] 初始化面板时出错:', error);
        toastr.error(`初始化面板时出错: ${error.message}`, '[AutoRunner] 致命错误');
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
