from flask import Flask, render_template

app = Flask(__name__, static_folder="static", template_folder="templates")


@app.get("/final")
def index():
    return render_template("index.html")

@app.route('/almanac')
def almanac():
    return render_template('almanac.html')
    
if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=14980)
