//
//  ViewController.swift
//  SafariDark
//
//  Created by ice on 17/5/26.
//

import Cocoa
import SafariServices
import WebKit

let extensionBundleIdentifier = "pet.zzz.SafariDark.Extension"

class ViewController: NSViewController, WKNavigationDelegate, WKScriptMessageHandler {

    @IBOutlet var webView: WKWebView!

    override func viewDidLoad() {
        super.viewDidLoad()

        self.webView.navigationDelegate = self

        self.webView.configuration.userContentController.add(self, name: "controller")

        self.webView.loadFileURL(Bundle.main.url(forResource: "Main", withExtension: "html")!, allowingReadAccessTo: Bundle.main.resourceURL!)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        SFSafariExtensionManager.getStateOfSafariExtension(withIdentifier: extensionBundleIdentifier) { (state, error) in
            DispatchQueue.main.async {
                let usesSettingsName: Bool
                if #available(macOS 13, *) {
                    usesSettingsName = true
                } else {
                    usesSettingsName = false
                }

                if let state = state, error == nil {
                    webView.evaluateJavaScript("showStatus('\(state.isEnabled ? "on" : "off")', \(usesSettingsName))")
                } else {
                    webView.evaluateJavaScript("showStatus('error', \(usesSettingsName))")
                }
            }
        }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        if (message.body as! String != "open-preferences") {
            return;
        }

        SFSafariApplication.showPreferencesForExtension(withIdentifier: extensionBundleIdentifier) { error in
            DispatchQueue.main.async {
                NSApplication.shared.terminate(nil)
            }
        }
    }

}
