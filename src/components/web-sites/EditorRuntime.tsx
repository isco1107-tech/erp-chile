'use client';

import { createContext, useContext } from 'react';
import * as website from '@/modules/web-sites/actions/web-sites.actions';

export type EditorActions = Pick<
  typeof website,
  | 'getWebSiteAction'
  | 'saveWebSiteContentAction'
  | 'updateWebSiteSettingsAction'
  | 'publishWebSiteAction'
  | 'unpublishWebSiteAction'
  | 'updateWebSiteAssetAltAction'
  | 'deleteWebSiteAssetAction'
  | 'listCatalogProductsAction'
  | 'listFormMessagesAction'
  | 'setWebSiteMessageReadAction'
  | 'setWebSiteMessageArchivedAction'
  | 'deleteWebSiteMessageAction'
  | 'markWebSiteMessagesReadAction'
  | 'routeWebSiteMessageAction'
  | 'listAcademyGroupNamesAction'
  | 'getWebSiteDomainAction'
  | 'setWebSiteDomainAction'
  | 'removeWebSiteDomainAction'
>;
const RuntimeContext = createContext<{ scope: 'website' | 'store'; actions: EditorActions; siteId?: string }>({ scope: 'website', actions: website });
export const EditorRuntimeProvider = RuntimeContext.Provider;
export const useEditorRuntime = () => useContext(RuntimeContext);
