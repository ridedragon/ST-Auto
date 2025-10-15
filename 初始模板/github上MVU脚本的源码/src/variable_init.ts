// 整体游戏数据类型
import { getLastValidVariable, updateVariables } from '@/function';
import { cleanUpMetadata, EXTENSIBLE_MARKER, generateSchema } from '@/schema';
import { isObjectSchema, MvuData, RootAdditionalProps, SchemaNode } from '@/variable_def';
import JSON5 from 'json5';
import TOML from 'toml';

type LorebookEntry = {
    content: string;
    comment?: string;
};

export async function initCheck() {
    let variables: MvuData & Record<string, any>;
    //这个函数需要处理 dryRun,因为0层。

    try {
        if (SillyTavern.chat.length === 0) {
            console.error('不存在任何一条消息，退出');
            toastr.error('需要有开场白才能初始化变量', '[MVU]变量初始化失败');
            return;
        }
        variables = (await getLastValidVariable(getLastMessageId())) ?? createEmptyGameData();
    } catch (e) {
        console.error('不存在任何一条消息，退出');
        return;
    }

    // 确保变量结构完整
    if (variables === undefined) {
        variables = createEmptyGameData();
    }
    if (!_.has(variables, 'initialized_lorebooks')) {
        variables.initialized_lorebooks = {};
    }
    if (Array.isArray(variables.initialized_lorebooks)) {
        console.warn(
            'Old "initialized_lorebooks" array format detected. Migrating to the new object format.'
        );
        const oldArray = variables.initialized_lorebooks as string[];
        const newObject: Record<string, any[]> = {};
        for (const lorebookName of oldArray) {
            newObject[lorebookName] = []; // 按照新格式，值为一个空数组
        }
        variables.initialized_lorebooks = newObject;
    }
    if (!variables.stat_data) {
        variables.stat_data = {};
    }
    if (!variables.schema) {
        variables.schema = { extensible: false, properties: {}, type: 'object' };
    }

    // 加载 InitVar 数据
    const is_updated = await loadInitVarData(variables);

    // --- 一次性清理所有魔法字符串 ---
    if (is_updated) {
        // 递归遍历整个 stat_data，移除所有魔法字符串
        const cleanData = (data: any) => {
            if (Array.isArray(data)) {
                // 使用 filter 创建一个不含标记的新数组
                const cleanedArray = data.filter(item => item !== EXTENSIBLE_MARKER);
                // 递归清理数组内的对象或数组
                cleanedArray.forEach(cleanData);
                return cleanedArray;
            }
            if (_.isObject(data)) {
                const newObj: Record<string, any> = {};
                const typedData = data as Record<string, any>; // 类型断言
                for (const key in data) {
                    // 递归清理子节点，并将结果赋给新对象
                    newObj[key] = cleanData(typedData[key]);
                }
                return newObj;
            }
            return data;
        };
        // 在生成 Schema 之前，先清理一遍 stat_data
        // 这里需要先生成 Schema，再清理数据
        // 所以还是得用克隆
    }

    // 在所有 lorebook 初始化完成后，生成最终的模式
    if (is_updated || !variables.schema || _.isEmpty(variables.schema)) {
        // 1. 克隆数据用于 Schema 生成
        const dataForSchema = structuredClone(variables.stat_data);
        // 2. generateSchema 会读取并移除克隆体中的标记，生成正确的 schema
        // 对于增量场景，会以之前的 schema 为基础生成。
        const generated_schema: SchemaNode & RootAdditionalProps = generateSchema(
            dataForSchema,
            variables.schema
        );

        // 使用类型守卫确保生成的 schema 是 ObjectSchemaNode
        if (isObjectSchema(generated_schema)) {
            if (_.has(variables.stat_data, '$meta.strictTemplate'))
                generated_schema.strictTemplate = variables.stat_data['$meta']
                    ?.strictTemplate as boolean;
            if (_.has(variables.stat_data, '$meta.concatTemplateArray'))
                generated_schema.concatTemplateArray = variables.stat_data['$meta']
                    ?.concatTemplateArray as boolean;
            if (_.has(variables.stat_data, '$meta.strictSet'))
                generated_schema.strictSet = variables.stat_data['$meta']?.strictSet as boolean;
            variables.schema = generated_schema;
        } else {
            console.error(
                'Generated schema is not an object schema, which is unexpected for stat_data root'
            );
        }

        // 3. 现在，清理真实的 stat_data，让它在后续操作中保持干净
        cleanUpMetadata(variables.stat_data);
    }

    if (!is_updated) {
        return;
    }

    console.info(`Init chat variables.`);
    await updateVariablesWith(data => _.assign(data, variables));

    if (getLastMessageId() == 0) {
        const last_msg = getChatMessages(0, { include_swipes: true })[0];
        // 更新所有 swipes
        await setChatMessages([
            {
                // last_msg 不一定存在 message_id
                message_id: 0,
                swipes_data: await Promise.all(
                    last_msg.swipes!.map(async swipe => {
                        const current_data = structuredClone(variables);
                        // 此处调用的是新版 updateVariables，它将支持更多命令
                        // 不再需要手动调用 substitudeMacros，updateVariables 会处理
                        await updateVariables(swipe, current_data);
                        console.log(`变量初始化完成`);
                        return current_data;
                    })
                ),
            },
        ]);
    } else {
        // 非开局直接更新到最后一条即可，也并不需要重新结算当前的变量
        // @ts-expect-error 该函数可用
        await setChatMessage({ data: variables }, getLastMessageId());
    }
    try {
        // 输出构建信息
        toastr.info(
            `有新的世界书初始化变量被加载，当前使用世界书:<br>${Object.entries(
                variables.initialized_lorebooks ?? {}
            )
                .map(([key, value]) => `- ${key}: ${JSON.stringify(value)}`)
                .join('<br>')}}`,
            '[MVU]变量初始化成功',
            {
                escapeHtml: false,
            }
        );
    } catch (_e) {
        /* empty */
    }

    // 更新 lorebook 设置
    await updateLorebookSettings();
}

/**
 * 获取所有启用的 lorebook 列表
 */
export async function getEnabledLorebookList(): Promise<string[]> {
    const lorebook_settings = await getLorebookSettings();
    const enabled_lorebook_list = [...lorebook_settings.selected_global_lorebooks];
    const char_lorebook = await getCurrentCharPrimaryLorebook();
    if (char_lorebook !== null) {
        enabled_lorebook_list.push(char_lorebook);
    }
    return enabled_lorebook_list;
}

/**
 * 从 lorebook 中加载所有 InitVar 数据并合并到提供的 GameData 中
 */
export async function loadInitVarData(
    mvu_data: MvuData,
    lorebook_list?: string[]
): Promise<boolean> {
    const enabled_lorebook_list = lorebook_list || (await getEnabledLorebookList());
    let is_updated = false;

    // 确保 initialized_lorebooks 是对象格式
    if (!mvu_data.initialized_lorebooks || Array.isArray(mvu_data.initialized_lorebooks)) {
        mvu_data.initialized_lorebooks = {};
    }

    for (const current_lorebook of enabled_lorebook_list) {
        // 适配 beta 分支的对象结构
        if (_.has(mvu_data.initialized_lorebooks, current_lorebook)) continue;
        mvu_data.initialized_lorebooks[current_lorebook] = [];
        const init_entries = (await getLorebookEntries(current_lorebook)) as LorebookEntry[];

        for (const entry of init_entries) {
            if (entry.comment?.toLowerCase().includes('[initvar]')) {
                const content = substitudeMacros(entry.content);
                let parsedData: any = null;
                let parseError: Error | null = null;

                // Try YAML first (which also handles JSON)
                try {
                    parsedData = YAML.parseDocument(content, { merge: true }).toJS();
                } catch (e) {
                    // Try JSON5
                    try {
                        // eslint-disable-next-line import-x/no-named-as-default-member
                        parsedData = JSON5.parse(content);
                    } catch (e2) {
                        // Try TOML
                        try {
                            parsedData = TOML.parse(content);
                        } catch (e3) {
                            parseError = new Error(
                                `initvar 不是有效的 YAML/JSON/JSON5/TOML 格式: ${e3}`
                            );
                        }
                    }
                }

                if (parseError) {
                    console.error(`解析世界书条目'${entry.comment}'失败: ${parseError}`);
                    toastr.error(parseError.message, `[MVU] 解析世界书条目'${entry.comment}'失败`, {
                        timeOut: 5000,
                    });
                    throw parseError;
                }

                if (parsedData) {
                    mvu_data.stat_data = _.merge(mvu_data.stat_data, parsedData);
                }
            }
        }
        is_updated = true;
    }

    return is_updated;
}

/**
 * 创建一个新的空 GameData 对象
 */
export function createEmptyGameData(): MvuData {
    return {
        display_data: {},
        initialized_lorebooks: {}, // 适配 beta 分支的对象结构
        stat_data: {},
        delta_data: {},
        schema: {
            type: 'object',
            properties: {},
        }, // beta 分支新增的 schema 字段
    };
}

/**
 * 获取最后一条消息的变量数据
 */
export async function getLastMessageVariables(): Promise<{
    message: ChatMessageSwiped;
    variables: MvuData | undefined;
}> {
    let last_chat_msg: ChatMessageSwiped[] = [];
    try {
        last_chat_msg = (await getChatMessages(-2, {
            role: 'assistant',
            include_swipes: true,
        })) as ChatMessageSwiped[];
    } catch (e) {
        // 在第一行时，必定发生异常。
    }

    if (!last_chat_msg || last_chat_msg.length <= 0) {
        const first_msg = await getChatMessages(0, {
            include_swipes: true,
        });
        if (first_msg && first_msg.length > 0) {
            last_chat_msg = first_msg;
        } else {
            throw new Error('不存在任何一条消息');
        }
    }

    const last_msg = last_chat_msg[0];
    const variables = last_msg.swipes_data[last_msg.swipe_id] as MvuData & Record<string, any>;

    return { message: last_msg, variables };
}

/**
 * 更新 lorebook 设置为推荐配置
 */
export async function updateLorebookSettings(): Promise<void> {
    /*Ref:https://github.com/lolo-desu/lolocard/blob/master/src/%E6%97%A5%E8%AE%B0%E7%BB%9C%E7%BB%9C/%E8%84%9A%E6%9C%AC/%E8%B0%83%E6%95%B4%E4%B8%96%E7%95%8C%E4%B9%A6%E5%85%A8%E5%B1%80%E8%AE%BE%E7%BD%AE.ts
     */
    const dst_setting: Partial<LorebookSettings> = {
        scan_depth: 2,
        context_percentage: 100,
        budget_cap: 0,
        min_activations: 0,
        max_depth: 0,
        max_recursion_steps: 0,

        insertion_strategy: 'character_first',

        include_names: false,
        recursive: true,
        case_sensitive: false,
        match_whole_words: false,
        use_group_scoring: false,
        overflow_alert: false,
    };
    const settings = getLorebookSettings();
    if (!_.isEqual(_.merge({}, settings, dst_setting), settings)) {
        setLorebookSettings(dst_setting);
    }
}

//window.initCheck = initCheck;
