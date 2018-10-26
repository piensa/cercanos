// Before running ths, we need:
// npm install flatbush geographiclib minimist progress
//
const papa = require('papaparse');
const Flatbush = require('flatbush');
const fs = require('fs');
const ProgressBar = require('progress');
const GeographicLib = require('geographiclib');
const args = require('minimist')(process.argv.slice(2));

const regions = JSON.parse(fs.readFileSync(args.r));

function createIndexFromFile(filename) {
    const contents =  JSON.parse(fs.readFileSync(filename));
    const count = contents.features.length;
    const index = new Flatbush(count);
    const data = new Array(count);

    const bar = new ProgressBar(`Loading ${filename} [:bar] :rate/pps :percent :etas (${count} items)`, {
        complete: '=',
        incomplete: ' ',
        width: 40,
        total: count
    });

    for (let [currentIndex, feature] of contents.features.entries()) {
        bar.tick(1);
        let d = feature.properties;
        data[currentIndex] = d;
        index.add(d.x, d.y, d.x, d.y);
    }

    index.finish();

    return {
        index,
        data
    }
}

function distance(lat1, lon1, lat2, lon2){
    const geod = GeographicLib.Geodesic.WGS84;
    const r = geod.Inverse(lat1, lon1, lat2, lon2);
    return Number(r.s12.toFixed(3));
}

function best(x, y, items) {
    let best_item = items[0];
    let best_d = distance(y, x, best_item.y, best_item.x);

    for (let i=0; i < items.length; i++ ) {
        let new_d = distance(y, x, items[i].y, items[i].x);
        if (new_d < best_d) {
            best_d = new_d;
            best_item = items[i];
        }
    }
    return best_item;
}

function nn(){
    const d = 0.00045;
    // half-line distance
    // d=100 m,
    const dx = d*4;
    const dy = d*4;
    // const dx = 0.0064; // 0.7 km lon
    // const dy = 0.0063; // 0.7 km lat

    // read file
    const cluster500 = createIndexFromFile(args.c);

    const targets = {}

    for (let target of args.t) {
        targets[target.replace('.geojson','')] = createIndexFromFile(target);
    }

    const region_population = {};

    let pbar = new ProgressBar('Loading population [:bar] :rate/pps :percent :etas', {
            complete: '=',
            incomplete: ' ',
            width: 40,
            total: regions.features.length
    });

    for (let i = 0; i < regions.features.length; i++){
        pbar.tick(1);
        let w = regions.features[i].properties;
        region_population[w.W_CODE] = {code: w.W_CODE, population: w.Pop2007, density: w.Density, area: w.Area};
    }



    let dataLength = cluster500.data.length;
    let clusters = [];
    let bar = new ProgressBar('Processing clusters [:bar] :rate/pps :percent :etas', {
        complete: '=',
        incomplete: ' ',
        width: 40,
        total: dataLength
    });

    for(let i = 0; i < dataLength; ++i) {
        bar.tick(1);
        let c = cluster500.data[i];

    	let meanX = c.x;
        let meanY = c.y;

        let candidates = 10;
        let n = {};

	for (let target of targets) {
           let t_all = target..index.neighbors(meanX, meanY, candidates).map((i) => target.data[i]);
	   let t = best(c.x, c.y, t_all);
	   let t_dist = distance(meanY, meanX, t.y, t.x);
           let t_info = {
            ??_x: t.x,
            ??_y: t.y,
            ??_distance_centroid: t_dist,
            ??_class: t["class"],
           };
           n = {...n, ...t_info};
	}


        let w = region_population[c.region];
    	let p ={};

    	if (w){
       	    p = {
        	    region_population: region_population[c.region].population,
        	    region_area: region_population[c.region].area,
        	    region_density: region_population[c.region].density,
            }
        }
        clusters.push({...c,...n,...p});
    }

	let csv = papa.unparse(clusters)
	fs.writeFileSync(args.o, csv);
}

nn();
