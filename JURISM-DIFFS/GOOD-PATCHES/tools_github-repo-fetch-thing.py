diff --git a/tools/github-repo-fetch-thing.py b/tools/github-repo-fetch-thing.py
new file mode 100644
index 0000000..3112259
--- /dev/null
+++ b/tools/github-repo-fetch-thing.py
@@ -0,0 +1,58 @@
+#!/bin/env python
+
+import json as simplejson
+import cgi
+import urllib
+import datetime
+import re
+import sys
+
+nowtime = datetime.datetime.now()
+timestamp = nowtime.isoformat()
+
+fs = cgi.FieldStorage()
+
+payload = simplejson.loads(fs.getvalue('payload'))
+paths = {}
+
+for commit in payload['commits']:
+    for path in commit['added']:
+        paths[path] = True
+    for path in commit['modified']:
+        paths[path] = True
+
+    #myout = open("/home/fbennett/public_html/cgi-bin/HERE.txt", "w+")
+    #myout.write("Debug note 1\n")
+    #myout.close()
+
+
+for path in paths:
+    if not path.startswith('mlz-') or not path.endswith('.csl') or not path.find('/') == -1:
+        continue
+
+    # fetch the files from GitHub
+    fetcher = urllib.URLopener()
+    ifh = fetcher.open("https://raw.githubusercontent.com/fbennett/mlz-styles/master/%s" % (path,))
+    content = ifh.read()
+    ifh.close()
+
+    # set timestamp
+    content = re.sub('<updated>.*</updated>', '<updated>%s</updated>' % (timestamp,), content)
+
+    # write file
+    ofh = open("/home/fbennett/public_html/github/%s" % (path,), "w+")
+    ofh.write(content)
+    ofh.close()
+
+## Formalities to complete the transaction ##
+
+page = '''Content-type: text/html
+
+<html>
+<body>
+<p>Success</p>
+</body>
+</html>
+'''
+
+print page