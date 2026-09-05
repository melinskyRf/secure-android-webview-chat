// ============================================================================
// CONTEUDO EDUCACIONAL - FINS DE ESTUDO E PESQUISA EM SEGURANCA DA INFORMACAO
// ============================================================================
// Este codigo e exclusivamente para fins educacionais e de pesquisa.
// NAO deve ser utilizado para atividades ilegais ou maliciosas.
// O autor nao se responsabiliza pelo uso indevido deste material.
// Use apenas em ambientes isolados (VMs, laboratorios).
// ============================================================================
package com.example.securechat

import android.annotation.SuppressLint
import android.content.pm.ApplicationInfo
import android.os.Bundle
import android.util.Log
import android.webkit.*
import androidx.appcompat.app.AppCompatActivity
// Note: Ensure androidx.webkit:webkit is integrated in build.gradle
import androidx.webkit.ProxyConfig
import androidx.webkit.ProxyController
import androidx.webkit.WebViewFeature
import java.net.InetSocketAddress
import java.net.Socket
import kotlin.concurrent.thread

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private val SOCKS_HOST = "127.0.0.1"
    private val SOCKS_PORT = 9050

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        webView = WebView(this)
        setContentView(webView)

        if (0 != (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE)) {
            WebView.setWebContentsDebuggingEnabled(true)
        } else {
            WebView.setWebContentsDebuggingEnabled(false)
        }

        with(webView.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false  
            allowContentAccess = false
            setSupportMultipleWindows(false)
            javaScriptCanOpenWindowsAutomatically = false
        }

        webView.addJavascriptInterface(WebAppInterface(), "Android")

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                return true // Prevent Intent hijacking entirely
            }

            override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
                super.onReceivedError(view, request, error)
                // Fallback mechanics: If the proxy pipe crashes mid-flight, dynamically Clear constraints
                if (error?.errorCode == ERROR_PROXY_AUTHENTICATION || error?.errorCode == ERROR_TIMEOUT || error?.errorCode == ERROR_CONNECT) {
                    Log.w("SecureChat", "Proxy Pipeline crashed! Initiating automatic clearnet fallback...")
                    clearProxyAndReload()
                }
            }
        }
        
        // Asynchronously check SOCKS5 availability (e.g. Orbot Tor gateway)
        thread {
            if (isProxyReachable()) {
                runOnUiThread {
                    Log.i("SecureChat", "Local SOCKS5 Pipe detected. Configuring secure routing...")
                    setSocks5Proxy()
                    bootApplication()
                }
            } else {
                runOnUiThread {
                    Log.w("SecureChat", "SOCKS5 Pipeline offline on Boot. Initiating native clearnet fallback...")
                    // Explicitly load without proxy constraints
                    bootApplication()
                }
            }
        }
    }

    /**
     * JavaScript Bridge for Admin Control
     */
    inner class WebAppInterface {
        @JavascriptInterface
        fun setProxy(host: String, port: Int) {
            runOnUiThread {
                Log.i("SecureChat", "Remote Admin Command: Configuring SOCKS5 Proxy to $host:$port")
                // Update global tracking (if needed) and apply
                setSocks5Proxy(host, port)
            }
        }

        @JavascriptInterface
        fun clearProxy() {
            runOnUiThread {
                Log.i("SecureChat", "Remote Admin Command: Clearing Proxy Routing.")
                clearProxyAndReload()
            }
        }

        @JavascriptInterface
        fun reloadApp() {
            runOnUiThread { bootApplication() }
        }
    }

    private fun bootApplication() {
        webView.loadUrl("file:///android_asset/index.html")
    }

    /**
     * Executes a raw TCP SYN to the local proxy port (Orbot standard :9050)
     */
    private fun isProxyReachable(host: String = SOCKS_HOST, port: Int = SOCKS_PORT): Boolean {
        return try {
            val socket = Socket()
            socket.connect(InetSocketAddress(host, port), 1500)
            socket.close()
            true
        } catch (e: Exception) {
            false
        }
    }

    private fun setSocks5Proxy(host: String = SOCKS_HOST, port: Int = SOCKS_PORT) {
        if (WebViewFeature.isFeatureSupported(WebViewFeature.PROXY_OVERRIDE)) {
            val proxyUrl = "socks5://$host:$port"
            val proxyConfig = ProxyConfig.Builder()
                .addProxyRule(proxyUrl)
                .addDirect() // Adds fallback natively if the specific rule drops entirely inside WebView Core
                .build()

            ProxyController.getInstance().setProxyOverride(
                proxyConfig,
                { /* Proxy applied callback */ },
                { Log.i("SecureChat", "Proxy Rules effectively applied within Webview Kernel.") }
            )
        } else {
            Log.e("SecureChat", "Android WebView component is too old to support native SOCKS architecture.")
        }
    }

    private fun clearProxyAndReload() {
        if (WebViewFeature.isFeatureSupported(WebViewFeature.PROXY_OVERRIDE)) {
            ProxyController.getInstance().clearProxyOverride(
                { /* Cleared natively */ },
                { 
                    runOnUiThread { 
                        // Once explicitly cleared, flush engine to reboot natively
                        bootApplication() 
                    }
                }
            )
        }
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }
}
