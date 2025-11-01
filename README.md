# Graph Visualizer — Kruskal's MST Algorithm

This is a single-file, interactive web application for visualizing Kruskal's algorithm for finding the Minimum Spanning Tree (MST) of a graph.

## Description

This tool provides a user-friendly interface for creating, manipulating, and visualizing graphs. It implements Kruskal's algorithm to find and display the Minimum Spanning Tree of an undirected graph. The application is built with vanilla JavaScript and uses the Cytoscape.js library for graph rendering and manipulation.

## Features

- **Create Nodes and Edges:** Easily add nodes and weighted edges to the graph.
- **Interactive Graph:** Drag and move nodes to customize the graph layout.
- **Kruskal's Algorithm Visualization:** Run Kruskal's algorithm and see the step-by-step process of building the MST.
- **Import/Export:**
  - Export the graph to JSON, CSV, or PNG formats.
  - Import a graph from a JSON file.
- **Sample Graph:** Load a sample graph to quickly see the visualizer in action.
- **Animation Speed Control:** Adjust the animation speed of the algorithm visualization.
- **Clear and Reset:** Clear the entire graph or reset the highlights from the algorithm.

## How to Use

1. **Open the file:** Clone the repository and open the `graph_algorithm_visualizer_kruskal_single_file.html` file in your web browser.
2. **Add Nodes:**
   - Click on the canvas to add a new node.
   - Alternatively, enter a label in the "Add node" input field and click "Add Node".
3. **Add Edges:**
   - Enter the source and target node labels in the respective input fields.
   - Set the weight for the edge.
   - Click "Create Edge".
4. **Run Kruskal's Algorithm:**
   - Once you have a graph, click the "Run Kruskal (MST)" button to see the algorithm in action.
   - The algorithm's output will be displayed in the "Algorithm Output" log.
5. **Import/Export:**
   - Use the "Import / Export" controls to save or load your graph.

## Technologies Used

- **HTML5**
- **CSS3**
- **Vanilla JavaScript**
- **[Cytoscape.js](https://js.cytoscape.org/):** A graph theory library for visualization and analysis.
