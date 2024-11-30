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

import { Devs } from "@utils/constants";
import { openUserProfile } from "@utils/discord";
import definePlugin from "@utils/types";
import { findByCode } from "@webpack";


export default definePlugin({
    name: "InteractionInfoUserContextMenu",
    description: "Shows context menus when clicking user in 'Interaction Info'.",
    authors: [Devs.gatewaydiscrdgg],
    patches: [
        {
            find: "#{intl::INTERACTION_RESPONSE_CONTEXT_INSTALLED_BY}",
            replacement: [
                // open profile on left click
                {
                    match: /id:"interaction-user",label:(\i)\.username/,
                    replace: "$&,action:()=>$self.openProfilePopout($1),disabled:!1",
                },
            ],
        },

    ],

    start() {
        this.User = findByCode("hasVerifiedEmailOrPhone(){");
    },


    openProfilePopout(user) {
        openUserProfile(user.id);

        // TODO: Figure out this
        // React.createElement(ProfilePopout, {
        //     userId: userId,
        //     user: UserStore.getCurrentUser(userId),
        //     guildId: SelectedGuildStore.getGuildId(),
        //     onClose: () => { },
        //     onSelect: () => { }
        // });
    }
});

