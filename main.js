// Before running ths, we need:
// npm install flatbush progress geographiclib minimist
//
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
    const name = filename.split('.')[0];

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
        name,
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

function getTargetDistance(target, meanX, meanY, candidates, c) {
    const all = target.index.neighbors(meanX, meanY, candidates).map(i => target.data[i]);
    const theBest = best(c.x, c.y, all);
    const dist = distance(meanY, meanX, theBest.y, theBest.x);
    return {
        [`new_${target.name}_distance_centroid`] : dist,
        [`new_${target.name}_x`] : theBest.x,
        [`new_${target.name}_y`] : theBest.y,
        [`new_${target.name}_class`] : theBest["class"]
    };
}


(function (){
    const d = 0.00045;
    // half-line distance
    // d=100 m,
    const dx = d*4;
    const dy = d*4;
    // const dx = 0.0064; // 0.7 km lon
    // const dy = 0.0063; // 0.7 km lat

    // read file
    const cluster500 = createIndexFromFile(args.c);

    const targets = args.t.map(createIndexFromFile);

    const region_population = {};
    const pbar = new ProgressBar('Loading population [:bar] :rate/pps :percent :etas', {
            complete: '=',
            incomplete: ' ',
            width: 40,
            total: regions.features.length
    });

    for (feature of regions.features) {
        pbar.tick(1);
        let w = feature.properties;
        region_population[w.W_CODE] = {code: w.W_CODE, population: w.Pop2007, density: w.Density, area: w.Area};
    }

    const dataLength = cluster500.data.length;
    const clusters = [];
    const bar = new ProgressBar('Processing clusters [:bar] :rate/pps :percent :etas', {
        complete: '=',
        incomplete: ' ',
        width: 40,
        total: dataLength
    });

    for(let i = 0; i < dataLength; ++i) {
        bar.tick(1);
        const c = cluster500.data[i];

        const meanX = c.x;
        const meanY = c.y;

        const candidates = 10;

        const distList = targets.map(target => getTargetDistance(target, meanX, meanY, candidates, c))
        const n = Object.assign({}, ...distList);

        const w = region_population[c.region];
        const p = {};

        if (w){
            p = {
                region_population: region_population[c.region].population,
                region_area: region_population[c.region].area,
                region_density: region_population[c.region].density,
            }
        }

        clusters.push({...c,...n,...p});
    }

    console.log(`Total clusters: ${clusters.length}`);

    fs.writeFileSync(args.o, JSON.stringify(clusters) );
})();
