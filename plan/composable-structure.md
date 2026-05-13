Composition
  Programs/Step
    Voices (1-4)
      Pattern (step sequencer, shaker, Euclidean generator, etc)
        Trigs
          Note params
          Instrument params
          Cel (Event for Visualizer)
          UI params
      Instrument (synth, sampler + FX)
      Visualizer
      UI

This is the composable structure of a composition within the Herd system. A composition is comprised of many steps called a Program. It corresponds to a MIDI program change. Within a single Program, you have up to four Voices to find the users (a.k.a. players) will each be assigned a Voice. Within that Voice, there would be several things defined. The Voice would have an instrument such as a sampler along with all its configuration settings, such as which stamp are loaded all the filter parameters everything that forms the basis of that Voice. It would also have a Pattern, which would be a repeating sequence of Trigs that works as a step sequencer and contain Note information (pitch, duration, timing) as well as parameters for the instrument, visual events. An alternate type of Pattern would be a "shaker" — a special effect that uses motion of the mobile device to generate Trigs. Essentially, every time directional change is detected within the motion of the mobile device. A new Trig would be generated and pitch duration and timing may be modulated by the parameters of that shaking. It will also be possible to apply a certain amount of quantization to those generated Trigs.

There's also a visualizer which would render visual events. Typically, this would be very simple and would be aimed at generating a overall vibe in the room — something like a pixel where the display is every mobile device in the room. A flash of HSBA color, for instance.

Then we have the UI. UI Devices are Voice-local, but they can appear at key moments within a Program. Perhaps at the beginning, there's only one voice, and then a UI pops up and prompts the users to choose a voice, and then after that they are divided into these grouped voices. Or if a new program begins, and it uses a shaker rather than a pattern. The UI would prompt the user to shake their device.
