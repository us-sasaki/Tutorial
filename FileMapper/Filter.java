import java.io.*;

public class Filter {
	public static void main(String[] args) throws Exception {
		BufferedReader br = new BufferedReader(new FileReader(args[0]));
		while (true) {
			String line = br.readLine();
			if (line == null) break;
			for (int i = 1; i < args.length; i++) {
				if (line.startsWith(""+i+",")) System.out.println(line);
			}
		}
		br.close();
	}
}

