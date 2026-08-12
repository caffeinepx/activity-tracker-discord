
import { classNameFactory } from "@api/Styles";
import { Button } from "@components/Button";
import { FormSwitchCompat } from "@components/FormSwitch";
import { ModalCloseButton, ModalProps, ModalRoot, ModalSize, openModal } from "@utils/modal";
import { GuildStore, ScrollerThin, Text, useState } from "@webpack/common";

import { getUiModeClass, settings, type ScreenshotRedactMode } from "../settings";
import { getUserConfig, persistUserConfig } from "../store";
import { UserStalkerConfig } from "../types";
import { redactDisplayName, redactMask, redactTag } from "../utils";
import { BellIcon } from "./Icons";

const cl = classNameFactory("stalker-settings-");

function SettingRowWithNotification({
    label,
    note,
    logValue,
    notifyValue,
    onLogChange,
    onNotifyChange
}: {
    label: string;
    note: string;
    logValue: boolean;
    notifyValue: boolean;
    onLogChange: (value: boolean) => void;
    onNotifyChange: (value: boolean) => void;
}) {
    return (
        <div className="stalker-settings-row">
            <div className="stalker-settings-row__main">
                <FormSwitchCompat
                    value={logValue}
                    onChange={onLogChange}
                    note={note}
                >
                    {label}
                </FormSwitchCompat>
            </div>
            <BellIcon enabled={notifyValue} onClick={() => onNotifyChange(!notifyValue)} />
        </div>
    );
}

function NotifyChip({
    checked,
    onChange,
    children,
}: {
    checked: boolean;
    onChange: () => void;
    children: any;
}) {
    return (
        <button
            type="button"
            className={`stalker-settings-chip${checked ? " stalker-settings-chip--on" : ""}`}
            onClick={onChange}
        >
            <span className={`stalker-settings-chip__box${checked ? " stalker-settings-chip__box--on" : ""}`}>
                {checked && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                    </svg>
                )}
            </span>
            <span className="stalker-settings-chip__label">{children}</span>
        </button>
    );
}

function ServerSelectorModal({ modalProps, currentList, onUpdate }: { modalProps: ModalProps; currentList: string[]; onUpdate: (serverIds: string[]) => void; }) {
    const [selectedServers, setSelectedServers] = useState<Set<string>>(new Set(currentList));
    const [searchQuery, setSearchQuery] = useState("");

    const allGuilds = Object.values(GuildStore.getGuilds());
    const filteredGuilds = allGuilds.filter(guild =>
        guild.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const toggleServer = (serverId: string) => {
        const newSet = new Set(selectedServers);
        if (newSet.has(serverId)) newSet.delete(serverId);
        else newSet.add(serverId);
        setSelectedServers(newSet);
    };

    const handleSave = () => {
        onUpdate(Array.from(selectedServers));
        modalProps.onClose();
    };

    const { uiMode } = settings.use(["uiMode"]);
    const uiModeClass = getUiModeClass(uiMode as any);

    return (
        <ModalRoot {...modalProps} size={ModalSize.MEDIUM} className={`${cl("root")} stalker-settings-root ${uiModeClass}`}>
            <div className="stalker-islands-shell stalker-islands-shell--settings stalker-islands-shell--compact">
                <header className="stalker-island stalker-island--header">
                    <div className="stalker-modal-title-block">
                        <Text variant="heading-lg/semibold" className="stalker-modal-title">Select Servers</Text>
                        <Text variant="text-sm/normal" className="stalker-modal-subtitle">
                            {selectedServers.size} server{selectedServers.size === 1 ? "" : "s"} selected
                        </Text>
                    </div>
                    <ModalCloseButton onClick={modalProps.onClose} />
                </header>

                <div className="stalker-island stalker-island--settings-body">
                    <input
                        type="text"
                        placeholder="Search servers..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="stalker-server-search-input"
                    />

                    <ScrollerThin className="stalker-settings-scroll">
                        <div className="stalker-server-list">
                            {filteredGuilds.length === 0 ? (
                                <Text variant="text-md/normal" className="stalker-settings-muted">
                                    No servers found
                                </Text>
                            ) : (
                                filteredGuilds.map(guild => {
                                    const isSelected = selectedServers.has(guild.id);
                                    return (
                                        <div
                                            key={guild.id}
                                            onClick={() => toggleServer(guild.id)}
                                            className={`stalker-server-item${isSelected ? " selected" : ""}`}
                                        >
                                            <div className={`stalker-server-check${isSelected ? " stalker-server-check--on" : ""}`}>
                                                {isSelected && (
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
                                                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                                                    </svg>
                                                )}
                                            </div>
                                            {guild.icon && (
                                                <img
                                                    src={`https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=32`}
                                                    alt=""
                                                    className="stalker-server-item__icon"
                                                />
                                            )}
                                            <Text variant="text-md/normal" className="stalker-server-item-name">
                                                {guild.name}
                                            </Text>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </ScrollerThin>

                    <div className="stalker-settings-footer">
                        <div className="stalker-settings-footer__left">
                            <Button size="small" variant="secondary" onClick={() => setSelectedServers(new Set(allGuilds.map(g => g.id)))}>
                                Select All
                            </Button>
                            <Button size="small" variant="secondary" onClick={() => setSelectedServers(new Set())}>
                                Clear
                            </Button>
                        </div>
                        <div className="stalker-settings-footer__right">
                            <Button variant="secondary" onClick={modalProps.onClose}>Cancel</Button>
                            <Button variant="primary" onClick={handleSave}>Save ({selectedServers.size})</Button>
                        </div>
                    </div>
                </div>
            </div>
        </ModalRoot>
    );
}

export function UserStalkerSettingsModal({
    modalProps,
    userId,
    userStore,
    screenshotMode = false,
    redactMode = "redact",
}: {
    modalProps: ModalProps;
    userId: string;
    userStore: any;
    screenshotMode?: boolean;
    redactMode?: ScreenshotRedactMode;
}) {
    const user = userStore.getUser(userId);
    const [config, setConfig] = useState<UserStalkerConfig>(() => getUserConfig(userId));

    const updateConfig = (key: keyof Omit<UserStalkerConfig, "userId">, value: any) => {
        const newConfig = { ...config, [key]: value };
        setConfig(newConfig);
        persistUserConfig(userId, newConfig);
    };

    const openServerSelector = () => {
        openModal(innerModalProps => (
            <ServerSelectorModal
                modalProps={innerModalProps}
                currentList={config.serverList || []}
                onUpdate={serverIds => updateConfig("serverList", serverIds)}
            />
        ));
    };

    const removeServer = (serverId: string) => {
        const currentList = config.serverList || [];
        updateConfig("serverList", currentList.filter(id => id !== serverId));
    };

    const rawName = user?.globalName || user?.global_name || user?.username || "User";
    const displayName = redactDisplayName(rawName, redactMode, screenshotMode);
    const tagText = user?.username ? redactTag(user.username, redactMode, screenshotMode) : "";

    const renderIdentity = (text: string, isTag = false) => {
        if (!screenshotMode) return text;
        if (redactMode === "redact") return text;
        return (
            <span
                className={`stalker-ss-text stalker-ss-text--${redactMode}`}
                aria-label="redacted"
                title=""
            >
                {redactMask(text, isTag)}
            </span>
        );
    };

    const { uiMode } = settings.use(["uiMode"]);
    const uiModeClass = getUiModeClass(uiMode as any);

    return (
        <ModalRoot {...modalProps} size={ModalSize.MEDIUM} className={`${cl("root")} stalker-settings-root ${uiModeClass}`}>
            <div className="stalker-islands-shell stalker-islands-shell--settings">
                <header className="stalker-island stalker-island--header">
                    <div className="stalker-modal-title-block">
                        <Text variant="heading-lg/semibold" className="stalker-modal-title">
                            User Settings
                        </Text>
                        <Text variant="text-sm/normal" className="stalker-modal-subtitle">
                            {renderIdentity(displayName)}
                            {tagText ? <> · {renderIdentity(tagText, true)}</> : null}
                        </Text>
                    </div>
                    <div className="stalker-modal-head-actions">
                        <ModalCloseButton onClick={modalProps.onClose} />
                    </div>
                </header>

                <div className="stalker-island stalker-island--settings-body">
                    <ScrollerThin className="stalker-settings-scroll">
                        <div className="stalker-settings-stack">
                            <section className="stalker-settings-section">
                                <div className="stalker-settings-section__head">
                                    <Text variant="text-sm/bold" className="stalker-settings-section__title">Logging & Notifications</Text>
                                    <Text variant="text-xs/normal" className="stalker-settings-section__note">
                                        Choose what is logged and what pings you. Use the bell to toggle notifications.
                                    </Text>
                                </div>

                                {/* Presence */}
                                <div className="stalker-settings-card">
                                    <SettingRowWithNotification
                                        label="Log Presence Changes"
                                        note="Status changes (online, idle, dnd, offline) and activities"
                                        logValue={config.logPresenceChanges}
                                        notifyValue={config.notifyPresenceChanges}
                                        onLogChange={value => updateConfig("logPresenceChanges", value)}
                                        onNotifyChange={value => updateConfig("notifyPresenceChanges", value)}
                                    />

                                    {config.notifyPresenceChanges && (
                                        <div className="stalker-settings-subpanel">
                                            <Text variant="text-xs/bold" className="stalker-settings-subpanel__label">Notify on status</Text>
                                            <div className="stalker-settings-chips">
                                                <NotifyChip checked={config.notifyOnline !== false} onChange={() => updateConfig("notifyOnline", !(config.notifyOnline !== false))}>
                                                    🟢 Online
                                                </NotifyChip>
                                                <NotifyChip checked={config.notifyOffline !== false} onChange={() => updateConfig("notifyOffline", !(config.notifyOffline !== false))}>
                                                    ⚫ Offline
                                                </NotifyChip>
                                                <NotifyChip checked={config.notifyIdle !== false} onChange={() => updateConfig("notifyIdle", !(config.notifyIdle !== false))}>
                                                    🟡 Idle
                                                </NotifyChip>
                                                <NotifyChip checked={config.notifyDnd !== false} onChange={() => updateConfig("notifyDnd", !(config.notifyDnd !== false))}>
                                                    🔴 DND
                                                </NotifyChip>
                                            </div>
                                            <NotifyChip
                                                checked={config.notifyPotentiallyInvisible !== false}
                                                onChange={() => updateConfig("notifyPotentiallyInvisible", !(config.notifyPotentiallyInvisible !== false))}
                                            >
                                                ⚠️ Potentially invisible
                                            </NotifyChip>
                                            <Text variant="text-xs/normal" className="stalker-settings-hint">
                                                Mobile Online → Offline without Idle often means Invisible
                                            </Text>
                                        </div>
                                    )}
                                </div>

                                {/* Profile */}
                                <div className="stalker-settings-card">
                                    <SettingRowWithNotification
                                        label="Log Profile Changes"
                                        note="Avatar, banner, bio, decoration, nameplate, effect, theme colors, etc."
                                        logValue={config.logProfileChanges}
                                        notifyValue={config.notifyProfileChanges}
                                        onLogChange={value => updateConfig("logProfileChanges", value)}
                                        onNotifyChange={value => updateConfig("notifyProfileChanges", value)}
                                    />

                                    {config.notifyProfileChanges && (
                                        <div className="stalker-settings-subpanel">
                                            <Text variant="text-xs/bold" className="stalker-settings-subpanel__label">Notify on changes</Text>
                                            <div className="stalker-settings-chips">
                                                <NotifyChip checked={config.notifyUsername !== false} onChange={() => updateConfig("notifyUsername", !(config.notifyUsername !== false))}>
                                                    Username
                                                </NotifyChip>
                                                <NotifyChip checked={config.notifyAvatar !== false} onChange={() => updateConfig("notifyAvatar", !(config.notifyAvatar !== false))}>
                                                    Avatar
                                                </NotifyChip>
                                                <NotifyChip checked={config.notifyBanner !== false} onChange={() => updateConfig("notifyBanner", !(config.notifyBanner !== false))}>
                                                    Banner
                                                </NotifyChip>
                                                <NotifyChip checked={config.notifyBio !== false} onChange={() => updateConfig("notifyBio", !(config.notifyBio !== false))}>
                                                    Bio
                                                </NotifyChip>
                                                <NotifyChip checked={config.notifyPronouns !== false} onChange={() => updateConfig("notifyPronouns", !(config.notifyPronouns !== false))}>
                                                    Pronouns
                                                </NotifyChip>
                                                <NotifyChip checked={config.notifyGlobalName !== false} onChange={() => updateConfig("notifyGlobalName", !(config.notifyGlobalName !== false))}>
                                                    Display Name
                                                </NotifyChip>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Messages */}
                                <div className="stalker-settings-card">
                                    <SettingRowWithNotification
                                        label="Log Messages"
                                        note="When this user sends messages in servers you share"
                                        logValue={config.logMessages}
                                        notifyValue={config.notifyMessages}
                                        onLogChange={value => updateConfig("logMessages", value)}
                                        onNotifyChange={value => updateConfig("notifyMessages", value)}
                                    />

                                    {(config.logMessages || config.notifyMessages) && (
                                        <div className="stalker-settings-subpanel">
                                            <Text variant="text-xs/bold" className="stalker-settings-subpanel__label">Server filtering</Text>
                                            <div className="stalker-settings-radios">
                                                {([
                                                    ["all", "All servers"],
                                                    ["whitelist", "Only specific servers (whitelist)"],
                                                    ["blacklist", "All except specific (blacklist)"],
                                                ] as const).map(([mode, label]) => (
                                                    <label key={mode} className="stalker-settings-radio">
                                                        <input
                                                            type="radio"
                                                            checked={config.serverFilterMode === mode}
                                                            onChange={() => updateConfig("serverFilterMode", mode)}
                                                        />
                                                        <Text variant="text-sm/normal">{label}</Text>
                                                    </label>
                                                ))}
                                            </div>

                                            {config.serverFilterMode !== "all" && (
                                                <div className="stalker-settings-servers">
                                                    <div className="stalker-settings-servers__head">
                                                        <Text variant="text-sm/bold">
                                                            {config.serverFilterMode === "whitelist" ? "Whitelisted" : "Blacklisted"}
                                                        </Text>
                                                        <Button size="small" onClick={openServerSelector}>
                                                            {(config.serverList || []).length === 0 ? "Add Servers" : "Manage"}
                                                        </Button>
                                                    </div>
                                                    {(config.serverList || []).length === 0 ? (
                                                        <Text variant="text-sm/normal" className="stalker-settings-muted">
                                                            No servers selected yet.
                                                        </Text>
                                                    ) : (
                                                        <div className="stalker-settings-server-chips">
                                                            {(config.serverList || []).map(serverId => {
                                                                const guild = GuildStore.getGuild(serverId);
                                                                return (
                                                                    <div key={serverId} className="stalker-settings-server-chip">
                                                                        {guild?.icon && (
                                                                            <img
                                                                                src={`https://cdn.discordapp.com/icons/${serverId}/${guild.icon}.png?size=32`}
                                                                                alt=""
                                                                            />
                                                                        )}
                                                                        <span>{guild?.name ?? serverId}</span>
                                                                        <button type="button" onClick={() => removeServer(serverId)} aria-label="Remove">
                                                                            ×
                                                                        </button>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </section>

                            <section className="stalker-settings-section">
                                <div className="stalker-settings-section__head">
                                    <Text variant="text-sm/bold" className="stalker-settings-section__title">Typing Notifications</Text>
                                    <Text variant="text-xs/normal" className="stalker-settings-section__note">
                                        Instant alert when this user starts typing.
                                    </Text>
                                </div>

                                <div className="stalker-settings-card">
                                    <FormSwitchCompat
                                        value={config.notifyTyping}
                                        onChange={value => updateConfig("notifyTyping", value)}
                                        note="Show a notification when they begin typing"
                                    >
                                        Notify on Typing
                                    </FormSwitchCompat>

                                    {config.notifyTyping && (
                                        <div className="stalker-settings-subpanel">
                                            <div className="stalker-settings-inline">
                                                <Text variant="text-sm/semibold">Conversation window</Text>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    max={60}
                                                    value={config.typingConversationWindow ?? 10}
                                                    onChange={e => updateConfig("typingConversationWindow", parseInt(e.target.value) || 10)}
                                                    className="stalker-number-input stalker-number-input--sm"
                                                />
                                                <Text variant="text-sm/normal" className="stalker-settings-muted">minutes</Text>
                                            </div>
                                            <Text variant="text-xs/normal" className="stalker-settings-hint">
                                                Skip typing pings if you’ve recently messaged this user
                                            </Text>
                                        </div>
                                    )}
                                </div>
                            </section>
                        </div>
                    </ScrollerThin>

                    <div className="stalker-settings-footer">
                        <div />
                        <Button variant="primary" onClick={modalProps.onClose}>Done</Button>
                    </div>
                </div>
            </div>
        </ModalRoot>
    );
}

export function openUserStalkerSettings(
    userId: string,
    userStore: any,
    opts?: { screenshotMode?: boolean; redactMode?: ScreenshotRedactMode }
) {
    openModal(modalProps => (
        <UserStalkerSettingsModal
            modalProps={modalProps}
            userId={userId}
            userStore={userStore}
            screenshotMode={opts?.screenshotMode}
            redactMode={opts?.redactMode}
        />
    ));
}
