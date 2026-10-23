'use client';
import type { ReactNode } from 'react';
import { EditorRuntimeProvider, type EditorActions } from '@/components/web-sites/EditorRuntime';
import * as shop from '@/modules/ecommerce/actions/store-editor.actions';
import { getStoreDomainAction, setStoreDomainAction, removeStoreDomainAction } from '@/modules/ecommerce/actions/store-workspace.actions';
const storeActions: EditorActions = {
  getWebSiteAction: shop.getStoreEditorAction,
  saveWebSiteContentAction: shop.saveStoreContentAction,
  updateWebSiteSettingsAction: shop.updateStorePageSettingsAction,
  publishWebSiteAction: shop.publishStorePagesAction,
  unpublishWebSiteAction: shop.hideStorePagesAction,
  updateWebSiteAssetAltAction: shop.updateStoreAssetAltAction,
  deleteWebSiteAssetAction: shop.deleteStoreAssetAction,
  listCatalogProductsAction: shop.listStoreDesignProductsAction,
  listFormMessagesAction: shop.listStoreFormMessagesAction,
  setWebSiteMessageReadAction: shop.setStoreMessageReadAction,
  setWebSiteMessageArchivedAction: shop.setStoreMessageArchivedAction,
  deleteWebSiteMessageAction: shop.deleteStoreMessageAction,
  markWebSiteMessagesReadAction: shop.markStoreMessagesReadAction,
  routeWebSiteMessageAction: shop.routeStoreMessageAction,
  listAcademyGroupNamesAction: shop.listStoreAcademyGroupNamesAction,
  getWebSiteDomainAction: getStoreDomainAction,
  setWebSiteDomainAction: (id, input) => setStoreDomainAction(id, String((input as { domain?: string })?.domain ?? '')),
  removeWebSiteDomainAction: removeStoreDomainAction,
};
export function StoreEditorProvider({ siteId, children }: { siteId: string; children: ReactNode }) {
  return <EditorRuntimeProvider value={{ scope: 'store', actions: storeActions, siteId }}>{children}</EditorRuntimeProvider>;
}
