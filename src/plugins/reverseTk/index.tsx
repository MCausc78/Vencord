/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2023 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import "./style.css";

import { definePluginSettings } from "@api/Settings";
import { CheckedTextInput } from "@components/CheckedTextInput";
import { ModalCloseButton, ModalContent, ModalHeader, ModalRoot, ModalSize, openModal } from "@utils/modal";
import definePlugin, { OptionType } from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { Button, Checkbox, React, TabBar, Text, Tooltip, useState } from "@webpack/common";

const KNOWN_CAPABILITIES: [string, number, string][] = [
    ["LAZY_USER_NOTES", 1 << 0, "Remove the notes field from the READY event."],
    ["NO_AFFINE_USER_IDS", 1 << 1, "Disable member/presence syncing for implicit relationships"],
    ["VERSIONED_READ_STATES", 1 << 2, "Enable client state for ReadStates"],
    ["VERSIONED_USER_GUILD_SETTINGS", 1 << 3, "Enable client state for UserGuildSettings"],
    ["DEDUPE_USER_OBJECTS", 1 << 4, "Deduplicate user objects in READY."],
    ["PRIORITIZED_READY_PAYLOAD", 1 << 5, "Separate READY into two events (READY itself and READY_SUPPLEMENTAL)."],
    ["MULTIPLE_GUILD_EXPERIMENT_POPULATIONS", 1 << 6, "Changes populations field in guild_experiments in READY to be array of populations rather than a single population"],
    ["NON_CHANNEL_READ_STATES", 1 << 7, "Include read state tied to non-channel resources in READY"],
    ["AUTH_TOKEN_REFRESH", 1 << 8, "Enable migration of mfa.*** tokens"],
    ["USER_SETTINGS_PROTO", 1 << 9, "Disable legacy user settings (remove user_settings field in READY and prevent USER_SETTINGS_UPDATE event)"],
    ["CLIENT_STATE_V2", 1 << 10, "Enable client state caching v2"],
    ["PASSIVE_GUILD_UPDATE", 1 << 11, "Enable better passive guild updating, disables CHANNEL_UNREAD_UPDATE and enables PASSIVE_UPDATE_V1 instead"],
    ["AUTO_CALL_CONNECT", 1 << 12, "Automatically connect to all existing calls on startup"],
    ["DEBOUNCE_MESSAGE_REACTIONS", 1 << 13, "Debounce multiple message reaction add events"],
    ["PASSIVE_GUILD_UPDATE_V2", 1 << 14, "Enable even better passive guild updating, disables CHANNEL_UNREAD_UPDATE/PASSIVE_UPDATE_V1 and enables PASSIVE_UPDATE_V2 enabled"],
    ["PRIVATE_CHANNEL_OBFUSCATION", 1 << 15, "Reset all fields except 'id', 'name' (name is set to '___name___') in unavailable GuildChannel objects"],
    ["UNKNOWN_BIT_16", 1 << 16, "Unknown bit 16"],
    ["UNKNOWN_BIT_17", 1 << 17, "Unknown bit 17"],
    ["UNKNOWN_BIT_18", 1 << 18, "Unknown bit 18"],
    ["UNKNOWN_BIT_19", 1 << 19, "Unknown bit 19"],
    ["UNKNOWN_BIT_20", 1 << 20, "Unknown bit 20"],
    ["UNKNOWN_BIT_21", 1 << 21, "Unknown bit 21"],
    ["UNKNOWN_BIT_22", 1 << 22, "Unknown bit 22"],
    ["UNKNOWN_BIT_23", 1 << 23, "Unknown bit 23"],
    ["UNKNOWN_BIT_24", 1 << 24, "Unknown bit 24"],
    ["UNKNOWN_BIT_25", 1 << 25, "Unknown bit 25"],
    ["UNKNOWN_BIT_26", 1 << 26, "Unknown bit 26"],
    ["UNKNOWN_BIT_27", 1 << 27, "Unknown bit 27"],
    ["UNKNOWN_BIT_28", 1 << 28, "Unknown bit 28"],
    ["UNKNOWN_BIT_29", 1 << 29, "Unknown bit 29"],
    ["UNKNOWN_BIT_30", 1 << 30, "Unknown bit 30"],
    ["UNKNOWN_BIT_31", 1 << 31, "Unknown bit 31"],
];

const GatewaySocket = findByPropsLazy("send", "_handleDispatch");
type ConnectionState = "CLOSED" | "WILL_RECONNECT" | "CONNECTING" | "IDENTIFYING" | "RESUMING" | "SESSION_ESTABLISHED";
const ConnectionStates: Record<ConnectionState, string> = findByPropsLazy("CLOSED", "WILL_RECONNECT", "CONNECTING", "IDENTIFYING", "RESUMING", "SESSION_ESTABLISHED");

let capabilities: number | undefined = undefined;

// @ts-ignore
const _objectProto = ({}).__proto__;

function copy(obj: any): any {
    if (obj === undefined || obj === null || ["bigint", "boolean", "number", "string"].includes(typeof obj)) return obj;
    if (typeof obj === "function") return (...args) => obj(...args);
    if (Array.isArray(obj)) return obj.map(copy);

    const ret = {};
    for (const [k, v] of Object.entries(obj)) {
        ret[k] = copy(v);
    }

    if (!Object.is(obj.__proto__, _objectProto)) {
        // @ts-ignore
        ret.__proto__ = obj.__proto__;
    }

    return ret;
}

interface CallTracePayload {
    micros: number;
    calls?: [string, CallTracePayload][];
}

class CallTrace {
    name: string;
    duration: number;
    calls: CallTrace[];

    constructor(name: string, data: CallTracePayload) {
        this.name = name;
        this.duration = data.micros / 1000;
        this.calls = (data.calls || []).map(([n, d]) => new CallTrace(n, d));
    }

    toString(): string {
        return `CallTrace(name=${this.name}, duration=${this.duration}, calls=[${this.calls.map(call => call.toString()).join(', ')}] )`;
    }

    toData(): [string, CallTracePayload] {
        return [
            this.name,
            {
                micros: Math.round(this.duration * 1000),
                calls: this.calls.map(call => call.toData()),
            },
        ];
    }
}

function buildTree(calls: CallTrace[]): string {
    /**
     * Generates tree similar to one from official Discord client.
     * 
     * @param calls The traces to generate tree from.
     * @returns The generated tree.
     */
    let result = '';
    for (const call of calls) {
        result += `${call.name}: ${call.duration}\n`;
        if (call.calls.length > 0) {
            result += call.calls
                .map(subCall => buildTree([subCall]).split('\n').map(line => `|  ${line}`).join('\n'))
                .join('\n');
        }
    }
    return result;
}

enum ReverseTkModalTab {
    GATEWAY_TAB,
    LOGS_TAB,
    EVENTS_TAB,
}


function ReverseTkModalContent(
    {
        defaultTab,
    }: {
        defaultTab: ReverseTkModalTab,
    },
) {
    const [currentTab, setCurrentTab] = useState<ReverseTkModalTab>(defaultTab);

    const [fullReconnect, setFullReconnect] = useState(false);
    const [destroyOldSession, setDestroyOldSession] = useState(true);
    const [currentCapabilities, setCapabilities] = useState(capabilities);

    return (
        <>
            <TabBar
                type="top"
                look="brand"
                className="vc-reverse-tk-tab-bar"
                selectedItem={currentTab}
                onItemSelect={setCurrentTab}
            >
                <TabBar.Item
                    className="vc-reverse-tk-tab-bar-item"
                    id={ReverseTkModalTab.GATEWAY_TAB}
                >
                    Gateway
                </TabBar.Item>
                <TabBar.Item
                    className="vc-reverse-tk-tab-bar-item"
                    id={ReverseTkModalTab.LOGS_TAB}
                >
                    Logs
                </TabBar.Item>
                <TabBar.Item
                    className="vc-reverse-tk-tab-bar-item"
                    id={ReverseTkModalTab.EVENTS_TAB}
                >
                    Events
                </TabBar.Item>
            </TabBar>

            <div className="vc-reverse-tk-tab-bar-content">
                {({
                    [ReverseTkModalTab.GATEWAY_TAB]: () => (
                        <div className="vc-reverse-tk-tab-bar-inner-content">
                            <div className="vc-gateway-controller-action">
                                <Checkbox
                                    value={fullReconnect}
                                    onChange={() => setFullReconnect(!fullReconnect)}
                                >
                                    Whether to perform full reconnect
                                </Checkbox>
                            </div>

                            <div className="vc-gateway-controller-action">
                                <Checkbox
                                    value={destroyOldSession}
                                    onChange={() => {
                                        const val = !destroyOldSession;
                                        setDestroyOldSession(val);
                                        if (val) setFullReconnect(false);
                                    }}
                                >
                                    Whether to destroy old session upon doing a reconnect
                                </Checkbox>
                            </div>

                            <div className="vc-gateway-controller-action">
                                <Button
                                    color={Button.Colors.RED}
                                    onClick={() => {
                                        if (fullReconnect) {
                                            GatewaySocket.seq = 0;
                                            GatewaySocket.sessionId = null;
                                        }

                                        if (destroyOldSession) {
                                            GatewaySocket._cleanup((ws: any) => ws.close(1000));
                                            GatewaySocket.connectionState = ConnectionStates.WILL_RECONNECT;
                                            GatewaySocket._connect();
                                        } else {
                                            GatewaySocket._handleReconnect();
                                        }
                                    }}
                                    size={Button.Sizes.TINY}
                                >
                                    Reconnect to Gateway
                                </Button>
                            </div>

                            <Text variant="heading-lg/medium">Capabilities</Text>

                            <CheckedTextInput
                                value={(currentCapabilities as any)?.toString() ?? "0"}
                                onChange={v => setCapabilities(+v)}
                                validate={v => /^[0-9]+$/.test(v) || "Provided capabilities value is invalid"}
                            />

                            {...(capabilities === undefined ? [] : KNOWN_CAPABILITIES.map(entry => {
                                const name = entry[0];
                                const value = entry[1];

                                return (
                                    <div className="vc-gateway-controller-capability" key={`vc-gateway-controller-capability-div-${name.toLowerCase().replace("_", "-")}`}>
                                        <Checkbox
                                            key={`vc-gateway-controller-capability-checkbox-${name.toLowerCase().replace("_", "-")}`}
                                            value={!!(capabilities!! & value)}
                                            onChange={() => {
                                                // @ts-ignore
                                                if (capabilities!! & value) {
                                                    // @ts-ignore
                                                    capabilities!! &= ~value;
                                                } else {
                                                    // @ts-ignore
                                                    capabilities!! |= value;
                                                }
                                                setCapabilities(capabilities!!);
                                            }}
                                        >
                                            {name}
                                            <Tooltip text={entry[2]}>
                                                {(tooltipProps: any) => (
                                                    <svg
                                                        {...tooltipProps}
                                                        fill="currentColor"
                                                        strokeWidth="0"
                                                        xmlns="http://www.w3.org/2000/svg"
                                                        viewBox="0 0 1024 1024"
                                                        height="1em"
                                                        width="1em"
                                                        style={{
                                                            overflow: "visible",
                                                            color: "currentcolor",
                                                            paddingLeft: "2px",
                                                        }}
                                                    >
                                                        <path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm0 820c-205.4 0-372-166.6-372-372s166.6-372 372-372 372 166.6 372 372-166.6 372-372 372z"></path>
                                                        <path d="M623.6 316.7C593.6 290.4 554 276 512 276s-81.6 14.5-111.6 40.7C369.2 344 352 380.7 352 420v7.6c0 4.4 3.6 8 8 8h48c4.4 0 8-3.6 8-8V420c0-44.1 43.1-80 96-80s96 35.9 96 80c0 31.1-22 59.6-56.1 72.7-21.2 8.1-39.2 22.3-52.1 40.9-13.1 19-19.9 41.8-19.9 64.9V620c0 4.4 3.6 8 8 8h48c4.4 0 8-3.6 8-8v-22.7a48.3 48.3 0 0 1 30.9-44.8c59-22.7 97.1-74.7 97.1-132.5.1-39.3-17.1-76-48.3-103.3zM472 732a40 40 0 1 0 80 0 40 40 0 1 0-80 0z"></path>
                                                    </svg>
                                                )}
                                            </Tooltip>
                                        </Checkbox>
                                    </div>
                                );
                            }))}
                        </div>
                    ),
                    [ReverseTkModalTab.LOGS_TAB]: () => (
                        <div className="vc-reverse-tk-tab-bar-inner-content">
                            <Text variant="text-lg/medium">
                                Sorry, thats not done yet.
                            </Text>
                        </div>
                    ),
                    [ReverseTkModalTab.EVENTS_TAB]: () => (
                        <div className="vc-reverse-tk-tab-bar-inner-content">
                            Not avaiablle currently.
                        </div>
                    )
                })[currentTab]?.() ?? (
                        <Text variant="text-lg/medium">
                            Sorry, the plugin is buggy mess. Please navigate to Gateway tab manually.
                        </Text>
                    )
                }
            </div>
        </>
    );
}

function ReverseTkModal({
    defaultTab,
    ...props
}) {
    // @ts-ignore
    return <ModalRoot {...props} size={ModalSize.MEDIUM}>
        <ModalHeader>
            <Text variant="heading-lg/semibold" style={{ flexGrow: 1 }}>ReverseTk</Text>
            <ModalCloseButton onClick={props.onClose} />
        </ModalHeader>
        <ModalContent>
            <ReverseTkModalContent defaultTab={defaultTab} />
        </ModalContent>
    </ModalRoot>;
}

const settings = definePluginSettings({
    fixReady: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Whether to fix READY event (only required if you're enabling capabilities that change event structure)",
    }
});

export default definePlugin({
    name: "ReverseTk",
    description: "Toolkit for reverse-engineering Discord APIs.",
    authors: [{
        id: 1073325901825187841n,
        name: "gatewaydisc.rdgg",
    }],

    patches: [
        {
            find: /_handleDispatch\((\i),(\i),(\i)\){/,
            replacement: [
                // capture and optionally modify incoming Gateway events
                {
                    match: /_handleDispatch\((\i),(\i),(\i)\){/,
                    replace: "$& { let _vctmp = $self._interceptIncomingDispatchPayload($2,$1,$3); $2 = _vctmp[0]; $1 = _vctmp[1]; }"
                },
                // Capture HELLO (we need only interval and trace)
                {
                    match: /_handleHello\((\i)\){/,
                    replace: '$& $1 = $self._interceptIncomingHello($1);'
                },
                // capture and optionally modify outgoing Gateway payloads
                {
                    match: /\(this,"send",\((\i),(\i),(\i)\)=>{/,
                    replace: "$& { let _vctmp = $self._interceptOutgoingPayload($1,$2,$3); $1 = _vctmp[0]; $2 = _vctmp[1]; $3 = _vctmp[2]; }",
                },

                // Capture connection state updates
                {
                    match: /set connectionState\((\i)\){/,
                    replace: "$& $self._captureConnectionStateUpdate(this.connectionState_, $1);",
                }
            ],
        },
    ],

    settings,

    dependencies: ["VencordToolbox"],
    toolboxActions: {
        "Gateway": () => openModal(props => <ReverseTkModal defaultTab="GATEWAY_TAB" {...props} />),
        "Logs": () => openModal(props => <ReverseTkModal defaultTab="LOGS_TAB" {...props} />),
    },


    _interceptIncomingDispatchPayload(type: string, data: any, extra: any): [string, any] {
        if (type === "READY" && settings.store.fixReady) {
            if (Array.isArray(data.read_state)) {
                data.read_state = {
                    entries: data.read_state,
                    partial: false,
                    version: 1,
                };
            }

            if (Array.isArray(data.user_guild_settings)) {
                data.user_guild_settings = {
                    entries: data.user_guild_settings,
                    partial: false,
                    version: 1,
                };
            }

            for (const guildData of data.guilds) {
                if (!("properties" in guildData)) {
                    const outerFields = [
                        "id",
                        "data_mode",
                        "partial_updates",
                        "channel_updates",
                        "guild_scheduled_events",
                        "joined_at",
                        "last_messages",
                        "member_count",
                        "members",
                        "premium_subscription_count",
                        "roles",
                        "stage_instances",
                        "unable_to_sync_deletes",
                        "threads",
                        "version",
                        "has_threads_subscription",

                        "stickers",
                        "presences",
                        "activity_instances",
                        "voice_states",

                    ];
                    const properties = {};
                    for (const key of Object.keys(guildData)) {
                        if (key! in outerFields) {
                            properties[key] = guildData[key];
                            delete guildData[key];
                        }
                    }
                    guildData.properties = properties;
                }
            }
        }
        return [type, data];
    },

    _interceptIncomingHello(data: any): any {
        return data;
    },

    _interceptOutgoingPayload(opcode: number, data: any, checkSessionEstablished: boolean | undefined = undefined): [number, any, boolean] {
        if (checkSessionEstablished === undefined) checkSessionEstablished = true;

        if (opcode === 2) {
            if (capabilities === undefined) {
                capabilities = data.capabilities;
            }
            data = copy(data);
            data.capabilities = capabilities;
        }

        return [opcode, data, checkSessionEstablished];
    },

    _captureConnectionStateUpdate(oldState: ConnectionState, newState: ConnectionState): void {
        // TODO: Uncomment when I will start working on logging
        // FluxDispatcher.dispatch({
        //     // @ts-ignore
        //     type: 'GATEWAY_CONNECTION_STATE_UPDATE',
        //     oldState,
        //     newState,
        // });
    }
});
