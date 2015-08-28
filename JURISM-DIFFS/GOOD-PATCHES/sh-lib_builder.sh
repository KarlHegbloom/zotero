diff --git a/sh-lib/builder.sh b/sh-lib/builder.sh
new file mode 100755
index 0000000..f1f35a0
--- /dev/null
+++ b/sh-lib/builder.sh
@@ -0,0 +1,113 @@
+function set-install-version () {
+    sed -si "s/<em:version>.*<\/em:version>/<em:version>${VERSION}<\/em:version>/" install.rdf
+    sed -si "s/<em:updateURL>.*<\/em:updateURL>/<em:updateURL>https:\/\/juris-m.github.io\/${CLIENT}\/update.rdf<\/em:updateURL>/" install.rdf
+}
+
+function xx-remove-and-replace-old-build-dir () {
+    rm -fR build
+    for i in build build/styles build/translators; do
+        mkdir $i
+    done
+}
+
+function xx-save-aside-deleted-translators-list () {
+    if [ ${RELEASE} -gt 1 ]; then
+        cp translators/deleted.txt .
+    fi
+}
+
+function xx-copy-files-into-xpi () {
+    for i in chrome components defaults resource; do
+        find $i -path "*/\.git" -prune -o -name "*~" -prune -o -print | zip "${XPI_FILE}" -@ >> "${LOG_FILE}"
+    done
+
+    for i in chrome.manifest COPYING deleted.txt install.rdf; do
+        if [ -f "$i" ]; then
+            echo $i | zip "${XPI_FILE}" -@ >> "${LOG_FILE}"
+        else
+            echo "Warning: file \"$i\" not found, unable to add to XPI" >> "${LOG_FILE}"
+        fi
+    done
+
+    for i in $(find resource -type f); do
+        echo $i | zip "${XPI_FILE}" -@ >> "${LOG_FILE}"
+    done
+}
+
+function xx-zip-up-styles () {
+    cp styles/* build/styles
+
+    cd build/styles
+    zip styles *.csl >> "${LOG_FILE}"
+    cd ../..
+    mv build/styles/styles.zip .
+}
+
+function xx-zip-up-translators () {
+    if [ ${RELEASE} -gt 1 ]; then
+        if [ -f translators.index ]; then
+            rm translators.index
+        fi
+        touch translators.index
+
+        if [ -d translators_actual ]; then
+            rm -fR translators_actual
+        fi
+        mkdir translators_actual
+        cd translators_actual
+
+        wget -O translators_actual.zip http://citationstylist.org/translators/translators.zip
+        unzip translators_actual.zip >> "${LOG_FILE}"
+        cd ..
+
+        COUNT=0
+        for i in translators_actual/*.js; do
+            FILENAME=$(echo ${COUNT}.js)
+            KEY=$(grep -m 1 translatorID "$i"| sed -e "s/.*translatorID\" *: *\"\([^\"]\+\)\".*/\\1/")
+            NAME=$(grep -m 1 label "$i"| sed -e "s/.*label\" *: *\"\([^\"]\+\)\".*/\\1/")
+            DATE=$(grep -m 1 lastUpdated "$i"| sed -e "s/.*lastUpdated\" *: *\"\([^\"]\+\)\".*/\\1/")
+            if [ "${KEY}" != "" ]; then
+                echo ${FILENAME},${KEY},${NAME},${DATE} >> translators.index
+                cp "$i" build/translators/${FILENAME}
+                echo -n "${FILENAME} "
+                echo $((COUNT++)) > /dev/null
+            fi
+        done
+
+        cd build/translators
+        zip translators *.js >> "${LOG_FILE}"
+        cd ../..
+        cp build/translators/translators.zip .
+    fi
+}
+
+function xx-add-styles-and-translators-to-zip () {
+    echo styles.zip | zip "${XPI_FILE}" -@ >> "${LOG_FILE}"
+    echo translators.index | zip "${XPI_FILE}" -@ >> "${LOG_FILE}"
+    echo translators.zip | zip "${XPI_FILE}" -@ >> "${LOG_FILE}"
+}
+
+function xx-cleanup () {
+    rm styles.zip
+}
+
+function xx-patch-sources-before-build () {
+    "${SCRIPT_DIR}/tools/patch-chrome.sh"
+}
+
+function xx-unpatch-sources-after-build () {
+    "${SCRIPT_DIR}/tools/unpatch-chrome.sh"
+}
+
+function build-the-plugin () {
+    xx-patch-sources-before-build
+    set-install-version
+    xx-remove-and-replace-old-build-dir
+    xx-save-aside-deleted-translators-list
+    xx-copy-files-into-xpi
+    xx-zip-up-styles
+    xx-zip-up-translators
+    xx-add-styles-and-translators-to-zip
+    xx-cleanup
+    xx-unpatch-sources-after-build
+}
